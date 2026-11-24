"""FastAPI app: accounts, CSV upload, background training, live progress, downloads."""
from __future__ import annotations

import json
import logging
import os
import re
import shutil
import time
import uuid
from contextlib import asynccontextmanager
from datetime import timedelta
from pathlib import Path

from fastapi import BackgroundTasks, Depends, FastAPI, File, HTTPException, Request, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse, StreamingResponse
from pydantic import BaseModel
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from . import db
from .auth import create_token, current_user, hash_password, verify_password, DUMMY_HASH, secret
from .llm import get_llm
from .profiling import infer_task, load_csv, profile_dataframe
from .team import run_team

logging.basicConfig(level=os.getenv("LOG_LEVEL", "INFO"), format="%(asctime)s %(levelname)s %(name)s: %(message)s")
log = logging.getLogger("adst")

DATA_ROOT = Path(os.getenv("DATA_DIR") or Path(__file__).resolve().parent.parent / "data")
DATA_DIR = DATA_ROOT / "runs"
MAX_BYTES = 20 * 1024 * 1024
EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")
RUN_ID_RE = re.compile(r"^[a-f0-9]{12}$")


@asynccontextmanager
async def lifespan(app: FastAPI):
    secret()  # fails fast in production when SECRET_KEY is missing
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    if not db.is_configured():
        db.configure(os.getenv("DATABASE_URL") or f"sqlite:///{DATA_ROOT / 'app.db'}")
    n = db.mark_interrupted()
    if n:
        log.warning("Marked %s interrupted run(s) as failed after restart", n)
    yield


app = FastAPI(title="Auto Data Science Team", version="0.4.0", lifespan=lifespan)
origins = [o.strip() for o in os.getenv("ALLOWED_ORIGINS", "http://localhost:3000,http://127.0.0.1:3000").split(",") if o.strip()]
app.add_middleware(CORSMiddleware, allow_origins=origins, allow_methods=["*"], allow_headers=["*"])


@app.exception_handler(Exception)
async def unhandled(request: Request, exc: Exception):
    log.exception("Unhandled error on %s %s", request.method, request.url.path)
    return JSONResponse({"detail": "Something went wrong on the server. Please try again."}, status_code=500)


# ---------- accounts ----------

class Credentials(BaseModel):
    email: str
    password: str


def _auth_response(user: db.User) -> dict:
    return {"token": create_token(user), "user": {"id": user.id, "email": user.email}}


@app.post("/api/auth/register", status_code=201)
def register(body: Credentials, s: Session = Depends(db.get_session)):
    if os.getenv("ALLOW_REGISTRATION", "true").lower() != "true":
        raise HTTPException(403, "New sign-ups are closed.")
    email = body.email.strip().lower()
    if not EMAIL_RE.match(email) or len(email) > 254:
        raise HTTPException(400, "Enter a valid email address.")
    if not 8 <= len(body.password) <= 128:
        raise HTTPException(400, "The password must be 8 to 128 characters long.")
    if s.scalar(select(db.User).where(db.User.email == email)):
        raise HTTPException(409, "An account with this email already exists.")
    user = db.User(email=email, password_hash=hash_password(body.password))
    s.add(user)
    try:
        s.commit()
    except IntegrityError:
        s.rollback()
        raise HTTPException(409, "An account with this email already exists.")
    log.info("New user %s", user.id)
    return _auth_response(user)


@app.post("/api/auth/login")
def login(body: Credentials, s: Session = Depends(db.get_session)):
    user = s.scalar(select(db.User).where(db.User.email == body.email.strip().lower()))
    ok = verify_password(body.password, user.password_hash if user else DUMMY_HASH)
    if not (user and ok):
        raise HTTPException(401, "Wrong email or password.")
    return _auth_response(user)


@app.get("/api/auth/me")
def me(user: db.User = Depends(current_user)):
    return {"id": user.id, "email": user.email}


# ---------- public ----------

@app.get("/api/health")
def health():
    try:
        with db.session_scope() as s:
            s.execute(select(1))
        return {"status": "ok", "database": "ok"}
    except Exception:
        log.exception("Health check failed")
        return JSONResponse({"status": "degraded", "database": "down"}, status_code=503)


@app.get("/api/config")
def config():
    """Tells the UI whether the LLM agents are switched on."""
    return {"ai": get_llm().info()}


# ---------- runs ----------

def owned_run(run_id: str, user: db.User, s: Session) -> db.Run:
    run = s.get(db.Run, run_id) if RUN_ID_RE.match(run_id) else None
    if run is None or run.user_id != user.id:
        raise HTTPException(404, "This run was not found.")
    return run


@app.get("/api/runs")
def list_runs(user: db.User = Depends(current_user), s: Session = Depends(db.get_session)):
    rows = s.scalars(select(db.Run).where(db.Run.user_id == user.id).order_by(db.Run.created_at.desc()).limit(30)).all()
    return [
        {"id": r.id, "filename": r.filename, "status": r.status, "target": r.target, "recommended": r.recommended, "created_at": r.created_at.isoformat()}
        for r in rows
    ]


@app.post("/api/runs")
async def create_run(file: UploadFile = File(...), user: db.User = Depends(current_user), s: Session = Depends(db.get_session)):
    if not (file.filename or "").lower().endswith((".csv", ".tsv", ".txt")):
        raise HTTPException(400, "Upload a .csv file.")
    limit = int(os.getenv("MAX_RUNS_PER_DAY", "30"))
    since = db.utcnow() - timedelta(days=1)
    used = s.scalar(select(func.count()).select_from(db.Run).where(db.Run.user_id == user.id, db.Run.created_at >= since)) or 0
    if used >= limit:
        raise HTTPException(429, f"Daily limit reached ({limit} files per day). Try again tomorrow.")

    run_id = uuid.uuid4().hex[:12]
    run_dir = DATA_DIR / run_id
    run_dir.mkdir(parents=True, exist_ok=True)
    path = run_dir / "raw.csv"
    try:
        size = 0
        with open(path, "wb") as out:
            while chunk := await file.read(1024 * 1024):
                size += len(chunk)
                if size > MAX_BYTES:
                    raise HTTPException(413, "The file is larger than 20 MB. Upload a smaller sample.")
                out.write(chunk)
        try:
            profile = profile_dataframe(load_csv(str(path)))
        except ValueError as exc:
            raise HTTPException(400, str(exc)) from exc
    except Exception:
        shutil.rmtree(run_dir, ignore_errors=True)
        raise
    run = db.Run(id=run_id, user_id=user.id, filename=(file.filename or "data.csv")[:255], profile=json.dumps(profile, default=str))
    s.add(run)
    s.commit()
    log.info("Run %s created by user %s (%s rows)", run_id, user.id, profile["rows"])
    return db.run_to_dict(run)


class TrainRequest(BaseModel):
    target: str
    task: str | None = None  # "regression" or "classification"; guessed when missing


def _train(run_id: str, target: str, task: str) -> None:
    steps: list[dict] = []

    def progress(fraction: float, message: str) -> None:
        db.update_run(run_id, progress=fraction, message=message[:255])

    def emit(step: dict) -> None:  # add a step, or update it when the id already exists
        for i, existing in enumerate(steps):
            if existing["id"] == step["id"]:
                steps[i] = step
                break
        else:
            steps.append(step)
        db.update_run(run_id, steps=steps)

    try:
        df = load_csv(str(DATA_DIR / run_id / "raw.csv"))
        result = run_team(df, target, task, emit, progress, artifact_dir=DATA_DIR / run_id / "artifacts")
        db.update_run(run_id, status="done", progress=1.0, result=result, recommended=result["recommendation"].get("model"), error=None)
        log.info("Run %s finished", run_id)
    except ValueError as exc:  # a problem the user can fix, such as a bad target column
        db.update_run(run_id, status="error", error=str(exc))
        log.info("Run %s rejected: %s", run_id, exc)
    except Exception:
        log.exception("Run %s failed", run_id)
        db.update_run(run_id, status="error", error="Training failed unexpectedly. Please try again or use another file.")


@app.post("/api/runs/{run_id}/train", status_code=202)
def train(run_id: str, body: TrainRequest, background: BackgroundTasks, user: db.User = Depends(current_user), s: Session = Depends(db.get_session)):
    run = owned_run(run_id, user, s)
    if s.scalar(select(func.count()).select_from(db.Run).where(db.Run.user_id == user.id, db.Run.status == "running")):
        raise HTTPException(409, "Another training is already running. Wait for it to finish.")
    names = [c["name"] for c in json.loads(run.profile)["columns"]]
    if body.target not in names:
        raise HTTPException(400, f"Column '{body.target}' was not found in the file.")
    if body.task not in (None, "regression", "classification"):
        raise HTTPException(400, "Task must be 'regression' or 'classification'.")
    task = body.task or infer_task(load_csv(str(DATA_DIR / run_id / "raw.csv"))[body.target])
    run.status, run.progress, run.message, run.target = "running", 0.0, "Starting", body.target
    run.result, run.recommended, run.error, run.steps = None, None, None, "[]"
    s.commit()
    background.add_task(_train, run_id, body.target, task)
    return {"status": "running"}


@app.get("/api/runs/{run_id}")
def read_run(run_id: str, user: db.User = Depends(current_user), s: Session = Depends(db.get_session)):
    return db.run_to_dict(owned_run(run_id, user, s))


@app.get("/api/runs/{run_id}/events")
def run_events(run_id: str, user: db.User = Depends(current_user)):
    """Server-sent events: a fresh copy of the run whenever it changes, until it stops running."""
    with db.session_scope() as s:
        owned_run(run_id, user, s)

    def stream():
        last, last_ping, deadline = None, time.monotonic(), time.monotonic() + 30 * 60
        while time.monotonic() < deadline:
            with db.session_scope() as s:
                run = s.get(db.Run, run_id)
                if run is None:
                    yield "event: gone\ndata: {}\n\n"
                    return
                marker, payload, status = (run.updated_at, run.status), db.run_to_dict(run), run.status
            if marker != last:
                last = marker
                yield f"data: {json.dumps(payload, default=str)}\n\n"
            if status != "running":
                return
            if time.monotonic() - last_ping > 15:  # keeps proxies from closing a quiet connection
                last_ping = time.monotonic()
                yield ": ping\n\n"
            time.sleep(0.4)

    headers = {"Cache-Control": "no-cache", "X-Accel-Buffering": "no"}
    return StreamingResponse(stream(), media_type="text/event-stream", headers=headers)


@app.delete("/api/runs/{run_id}", status_code=204)
def delete_run(run_id: str, user: db.User = Depends(current_user), s: Session = Depends(db.get_session)):
    run = owned_run(run_id, user, s)
    if run.status == "running":
        raise HTTPException(409, "This run is still training.")
    s.delete(run)
    s.commit()
    shutil.rmtree(DATA_DIR / run_id, ignore_errors=True)


DOWNLOADS = {
    "model": ("model.joblib", "application/octet-stream"),
    "code": ("train_model.py", "text/x-python"),
    "report": ("report.md", "text/markdown"),
}


@app.get("/api/runs/{run_id}/download/{kind}")
def download(run_id: str, kind: str, user: db.User = Depends(current_user), s: Session = Depends(db.get_session)):
    owned_run(run_id, user, s)
    if kind not in DOWNLOADS:
        raise HTTPException(404, "Unknown file type.")
    name, media = DOWNLOADS[kind]
    path = DATA_DIR / run_id / "artifacts" / name
    if not path.exists():
        raise HTTPException(404, "This file was not created. No model is saved when no model beats the baseline.")
    return FileResponse(path, filename=name, media_type=media)
