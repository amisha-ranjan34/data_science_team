"""FastAPI app: accounts, CSV upload, background training, live progress, downloads."""
from __future__ import annotations

import hashlib
import json
import logging
import os
import re
import secrets
import smtplib
import shutil
import time
import uuid
from contextlib import asynccontextmanager
from datetime import timedelta
from email.message import EmailMessage
from pathlib import Path
from urllib.parse import quote

from fastapi import BackgroundTasks, Depends, FastAPI, File, HTTPException, Request, Response, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse, StreamingResponse
from pydantic import BaseModel, Field
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from . import db, storage
from .auth import create_csrf_token, create_token, current_user, hash_password, verify_password, DUMMY_HASH, secret
from .llm import get_llm
from .profiling import infer_task, load_csv, profile_dataframe
from .team import make_what_if_plan, run_team

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
app.add_middleware(CORSMiddleware, allow_origins=origins, allow_methods=["*"], allow_headers=["*"], allow_credentials=True)


@app.exception_handler(Exception)
async def unhandled(request: Request, exc: Exception):
    log.exception("Unhandled error on %s %s", request.method, request.url.path)
    return JSONResponse({"detail": "Something went wrong on the server. Please try again."}, status_code=500)


# ---------- accounts ----------

class Credentials(BaseModel):
    email: str
    password: str


def _set_auth_cookies(response: Response, user: db.User) -> None:
    production = os.getenv("ENV", "dev").lower() == "production"
    same_site = os.getenv("AUTH_COOKIE_SAMESITE", "none" if production else "lax").lower()
    if same_site not in {"lax", "strict", "none"}:
        raise RuntimeError("AUTH_COOKIE_SAMESITE must be 'lax', 'strict' or 'none'.")
    secure = production or same_site == "none"
    max_age = int(os.getenv("TOKEN_DAYS", "7")) * 24 * 60 * 60
    session_token = create_token(user)
    response.set_cookie(
        "adst_session",
        session_token,
        max_age=max_age,
        httponly=True,
        secure=secure,
        samesite=same_site,
        path="/",
    )
    response.set_cookie(
        "adst_csrf",
        create_csrf_token(session_token),
        max_age=max_age,
        httponly=False,
        secure=secure,
        samesite=same_site,
        path="/",
    )


def _auth_response(response: Response, user: db.User) -> dict:
    _set_auth_cookies(response, user)
    return {"user": {"id": user.id, "email": user.email}}


def _smtp_configured() -> bool:
    return bool(os.getenv("SMTP_HOST") and (os.getenv("SMTP_FROM") or os.getenv("SMTP_USERNAME")))


def _new_verification_token(s: Session, user: db.User) -> str:
    s.query(db.EmailVerificationToken).filter_by(user_id=user.id).delete()
    token = secrets.token_urlsafe(32)
    hours = max(1, int(os.getenv("VERIFY_TOKEN_HOURS", "24")))
    s.add(
        db.EmailVerificationToken(
            user_id=user.id,
            token_hash=hashlib.sha256(token.encode()).hexdigest(),
            expires_at=db.utcnow() + timedelta(hours=hours),
        )
    )
    s.commit()
    return token


def _send_verification_email(email: str, token: str) -> None:
    host = os.getenv("SMTP_HOST")
    sender = os.getenv("SMTP_FROM") or os.getenv("SMTP_USERNAME")
    if not host or not sender:
        raise RuntimeError("Email verification requires SMTP_HOST and SMTP_FROM.")
    link = f"{os.getenv('FRONTEND_URL', 'http://localhost:3000').rstrip('/')}/?verify={quote(token)}"
    message = EmailMessage()
    message["Subject"] = "Verify your Auto Data Science Team account"
    message["From"] = sender
    message["To"] = email
    message.set_content(
        f"Verify your account using this link (valid for {max(1, int(os.getenv('VERIFY_TOKEN_HOURS', '24')))} hours):\n\n{link}\n"
    )
    username = os.getenv("SMTP_USERNAME")
    start_tls = os.getenv("SMTP_STARTTLS", "true").lower() == "true"
    if username and not start_tls:
        raise RuntimeError("SMTP_STARTTLS must be enabled when SMTP_USERNAME is set.")
    with smtplib.SMTP(host, int(os.getenv("SMTP_PORT", "587")), timeout=10) as smtp:
        smtp.ehlo()
        if start_tls:
            import ssl

            smtp.starttls(context=ssl.create_default_context())
            smtp.ehlo()
        if username:
            smtp.login(username, os.getenv("SMTP_PASSWORD", ""))
        smtp.send_message(message)


@app.post("/api/auth/register", status_code=201)
def register(body: Credentials, s: Session = Depends(db.get_session)):
    if os.getenv("ALLOW_REGISTRATION", "true").lower() != "true":
        raise HTTPException(403, "New sign-ups are closed.")
    email = body.email.strip().lower()
    if not EMAIL_RE.match(email) or len(email) > 254:
        raise HTTPException(400, "Enter a valid email address.")
    if not 8 <= len(body.password) <= 128:
        raise HTTPException(400, "The password must be 8 to 128 characters long.")
    if not _smtp_configured() and os.getenv("ENV", "dev").lower() == "production":
        raise HTTPException(503, "Email verification is not configured. Please try again later.")
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
    token = _new_verification_token(s, user)
    if _smtp_configured():
        try:
            _send_verification_email(email, token)
        except (OSError, smtplib.SMTPException, RuntimeError) as exc:
            log.exception("Could not send verification email for user %s", user.id)
            s.query(db.EmailVerificationToken).filter_by(user_id=user.id).delete()
            s.commit()
            raise HTTPException(503, "The verification email could not be sent. Please request another email.") from exc
    result = {"message": "Check your email to verify your account.", "email": email}
    if os.getenv("ENV", "dev").lower() != "production" and not _smtp_configured():
        result["verification_token"] = token
    return result


@app.post("/api/auth/login")
def login(body: Credentials, response: Response, s: Session = Depends(db.get_session)):
    user = s.scalar(select(db.User).where(db.User.email == body.email.strip().lower()))
    ok = verify_password(body.password, user.password_hash if user else DUMMY_HASH)
    if not (user and ok):
        raise HTTPException(401, "Wrong email or password.")
    if not user.email_verified:
        raise HTTPException(403, "Please verify your email address before logging in.")
    return _auth_response(response, user)


class VerificationRequest(BaseModel):
    token: str = Field(min_length=40, max_length=128)


class ResendVerificationRequest(BaseModel):
    email: str


@app.post("/api/auth/verify-email")
def verify_email(body: VerificationRequest, response: Response, s: Session = Depends(db.get_session)):
    token_hash = hashlib.sha256(body.token.encode()).hexdigest()
    token = s.scalar(select(db.EmailVerificationToken).where(db.EmailVerificationToken.token_hash == token_hash))
    if token is None:
        raise HTTPException(400, "This verification link is invalid or has expired.")
    if token.expires_at <= db.utcnow():
        s.delete(token)
        s.commit()
        raise HTTPException(400, "This verification link is invalid or has expired.")
    user = s.get(db.User, token.user_id)
    if user is None:
        s.delete(token)
        s.commit()
        raise HTTPException(400, "This verification link is invalid or has expired.")
    user.email_verified = True
    s.query(db.EmailVerificationToken).filter_by(user_id=user.id).delete()
    s.commit()
    return _auth_response(response, user)


@app.post("/api/auth/resend-verification", status_code=202)
def resend_verification(body: ResendVerificationRequest, s: Session = Depends(db.get_session)):
    generic = {"message": "If that account needs verification, instructions have been sent."}
    if not EMAIL_RE.match(body.email.strip()) or (
        not _smtp_configured() and os.getenv("ENV", "dev").lower() == "production"
    ):
        return generic
    user = s.scalar(select(db.User).where(db.User.email == body.email.strip().lower()))
    if user is None or user.email_verified:
        return generic
    previous = s.scalar(
        select(db.EmailVerificationToken)
        .where(db.EmailVerificationToken.user_id == user.id)
        .order_by(db.EmailVerificationToken.created_at.desc())
    )
    if _smtp_configured() and previous and db.utcnow() - previous.created_at < timedelta(minutes=1):
        return generic
    token = _new_verification_token(s, user)
    if _smtp_configured():
        try:
            _send_verification_email(user.email, token)
        except (OSError, smtplib.SMTPException, RuntimeError) as exc:
            log.exception("Could not resend verification email for user %s", user.id)
            s.query(db.EmailVerificationToken).filter_by(user_id=user.id).delete()
            s.commit()
            raise HTTPException(503, "The verification email could not be sent. Please try again later.") from exc
    elif os.getenv("ENV", "dev").lower() != "production":
        generic["verification_token"] = token
    return generic


@app.post("/api/auth/logout", status_code=204)
def logout(response: Response, user: db.User = Depends(current_user)):
    production = os.getenv("ENV", "dev").lower() == "production"
    same_site = os.getenv("AUTH_COOKIE_SAMESITE", "none" if production else "lax").lower()
    secure = production or same_site == "none"
    response.delete_cookie("adst_session", path="/", secure=secure, httponly=True, samesite=same_site)
    response.delete_cookie("adst_csrf", path="/", secure=secure, httponly=False, samesite=same_site)


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


def _train(
    run_id: str,
    target: str,
    task: str,
    plan_override: dict | None = None,
    profile_override: dict | None = None,
    what_if_context: dict | None = None,
) -> None:
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
        artifact_dir = DATA_DIR / run_id / "artifacts"
        result = run_team(
            df,
            target,
            task,
            emit,
            progress,
            artifact_dir=artifact_dir,
            plan_override=plan_override,
            profile_override=profile_override,
            what_if_context=what_if_context,
        )
        storage.store_artifacts(run_id, artifact_dir)
        if os.getenv("ARTIFACT_STORAGE", "local").lower() == "s3":
            shutil.rmtree(artifact_dir, ignore_errors=True)
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


class WhatIfRequest(BaseModel):
    question: str = Field(min_length=8, max_length=500)


@app.post("/api/runs/{run_id}/what-if", status_code=202)
def what_if(
    run_id: str,
    body: WhatIfRequest,
    background: BackgroundTasks,
    user: db.User = Depends(current_user),
    s: Session = Depends(db.get_session),
):
    parent = owned_run(run_id, user, s)
    if parent.status != "done" or not parent.result or not parent.target:
        raise HTTPException(409, "A completed experiment is required for what-if analysis.")
    if s.scalar(select(func.count()).select_from(db.Run).where(db.Run.user_id == user.id, db.Run.status == "running")):
        raise HTTPException(409, "Another training is already running. Wait for it to finish.")
    limit = int(os.getenv("MAX_RUNS_PER_DAY", "30"))
    since = db.utcnow() - timedelta(days=1)
    used = s.scalar(
        select(func.count()).select_from(db.Run).where(db.Run.user_id == user.id, db.Run.created_at >= since)
    ) or 0
    if used >= limit:
        raise HTTPException(429, f"Daily limit reached ({limit} experiments per day). Try again tomorrow.")

    parent_result = json.loads(parent.result)
    profile = json.loads(parent.profile)
    original_plan = parent_result.get("plan") or {}
    try:
        plan = make_what_if_plan(
            profile,
            parent.target,
            body.question,
            original_plan,
            [column["column"] for column in parent_result.get("dropped_columns", [])],
        )
    except ValueError as exc:
        raise HTTPException(400, str(exc)) from exc

    source_path = DATA_DIR / run_id / "raw.csv"
    if not source_path.is_file():
        raise HTTPException(410, "The original dataset is no longer available.")
    child_id = uuid.uuid4().hex[:12]
    child_dir = DATA_DIR / child_id
    child_dir.mkdir(parents=True, exist_ok=True)
    try:
        shutil.copyfile(source_path, child_dir / "raw.csv")
        recommendation = parent_result["recommendation"]
        baseline_model = recommendation.get("model")
        baseline = next((model for model in parent_result["models"] if model["name"] == baseline_model), None)
        context = {
            "parent_run_id": parent.id,
            "question": body.question,
            "baseline_metric": parent_result["primary_metric"],
            "baseline_model": baseline_model,
            "baseline_cv_mean": baseline["cv_mean"] if baseline else None,
        }
        child = db.Run(
            id=child_id,
            user_id=user.id,
            parent_run_id=parent.id,
            filename=(parent.filename + " (what-if)")[:255],
            status="running",
            progress=0.0,
            message="Preparing the what-if scenario",
            target=parent.target,
            profile=parent.profile,
            scenario=body.question,
        )
        s.add(child)
        s.commit()
    except Exception:
        s.rollback()
        shutil.rmtree(child_dir, ignore_errors=True)
        raise
    background.add_task(
        _train,
        child_id,
        parent.target,
        parent_result["task"],
        plan,
        profile,
        context,
    )
    return db.run_to_dict(child)


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
    storage.delete_artifacts(run_id)
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
    artifact = storage.get_artifact(run_id, name, DATA_DIR / run_id / "artifacts" / name)
    if artifact is None:
        raise HTTPException(404, "This file was not created. No model is saved when no model beats the baseline.")
    if isinstance(artifact, Path):
        return FileResponse(artifact, filename=name, media_type=media)
    return StreamingResponse(
        artifact,
        media_type=media,
        headers={"Content-Disposition": f'attachment; filename="{name}"'},
    )
