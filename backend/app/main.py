"""FastAPI app: upload a CSV, pick a target, train models in the background, poll for results."""
from __future__ import annotations

import json
import os
import re
import uuid
from pathlib import Path

from fastapi import BackgroundTasks, FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from pydantic import BaseModel

from .llm import get_llm
from .team import run_team
from .profiling import load_csv, profile_dataframe

DATA_DIR = Path(__file__).resolve().parent.parent / "data" / "runs"
MAX_BYTES = 20 * 1024 * 1024
RUNS: dict[str, dict] = {}  # in-memory for Phase 1; Phase 4 moves this to a database

app = FastAPI(title="Auto Data Science Team", version="0.1.0")
origins = os.getenv("ALLOWED_ORIGINS", "http://localhost:3000,http://127.0.0.1:3000").split(",")
app.add_middleware(CORSMiddleware, allow_origins=origins, allow_methods=["*"], allow_headers=["*"])


class TrainRequest(BaseModel):
    target: str
    task: str | None = None  # "regression" or "classification"; defaults to the profiled guess


def _save_state(run: dict) -> None:
    try:
        (DATA_DIR / run["id"] / "state.json").write_text(json.dumps(run, default=str), encoding="utf-8")
    except OSError:
        pass  # saving is a convenience; never break a run because of it


def get_run(run_id: str) -> dict:
    run = RUNS.get(run_id)
    if run is None and re.fullmatch(r"[a-f0-9]{12}", run_id):
        state = DATA_DIR / run_id / "state.json"
        if state.exists():  # the server restarted: bring the saved run back
            run = json.loads(state.read_text(encoding="utf-8"))
            if run["status"] == "running":
                run.update(status="error", error="The server restarted while training. Press Train again.")
            RUNS[run_id] = run
    if run is None:
        raise HTTPException(404, "This run was not found. Upload the file again.")
    return run


@app.get("/api/health")
def health():
    return {"status": "ok"}


@app.get("/api/config")
def config():
    """Tells the UI whether the LLM agents are switched on."""
    return {"ai": get_llm().info()}


@app.post("/api/runs")
async def create_run(file: UploadFile = File(...)):
    if not (file.filename or "").lower().endswith((".csv", ".tsv", ".txt")):
        raise HTTPException(400, "Upload a .csv file.")
    run_id = uuid.uuid4().hex[:12]
    run_dir = DATA_DIR / run_id
    run_dir.mkdir(parents=True, exist_ok=True)
    path = run_dir / "raw.csv"
    size = 0
    with open(path, "wb") as out:
        while chunk := await file.read(1024 * 1024):
            size += len(chunk)
            if size > MAX_BYTES:
                out.close()
                path.unlink(missing_ok=True)
                raise HTTPException(413, "The file is larger than 20 MB. Upload a smaller sample.")
            out.write(chunk)
    try:
        profile = profile_dataframe(load_csv(str(path)))
    except ValueError as exc:
        raise HTTPException(400, str(exc)) from exc
    RUNS[run_id] = {
        "id": run_id,
        "filename": file.filename,
        "status": "profiled",
        "progress": 0.0,
        "message": "",
        "profile": profile,
        "result": None,
        "error": None,
        "steps": [],
    }
    _save_state(RUNS[run_id])
    return RUNS[run_id]


def _train(run_id: str, target: str, task: str) -> None:
    run = RUNS[run_id]

    def progress(fraction: float, message: str) -> None:
        run["progress"], run["message"] = fraction, message

    def emit(step: dict) -> None:  # add a step, or update it when the id already exists
        for i, existing in enumerate(run["steps"]):
            if existing["id"] == step["id"]:
                run["steps"][i] = step
                return
        run["steps"].append(step)

    try:
        df = load_csv(str(DATA_DIR / run_id / "raw.csv"))
        run["result"] = run_team(df, target, task, emit, progress, artifact_dir=DATA_DIR / run_id / "artifacts")
        run["status"] = "done"
    except Exception as exc:  # surfaced to the UI as a readable message
        run["error"] = str(exc) if isinstance(exc, ValueError) else "Training failed unexpectedly. Check the server logs."
        run["status"] = "error"
        if not isinstance(exc, ValueError):
            _save_state(run)
            raise
    _save_state(run)


@app.post("/api/runs/{run_id}/train", status_code=202)
def train(run_id: str, body: TrainRequest, background: BackgroundTasks):
    run = get_run(run_id)
    if run["status"] == "running":
        raise HTTPException(409, "Training is already running for this file.")
    names = [c["name"] for c in run["profile"]["columns"]]
    if body.target not in names:
        raise HTTPException(400, f"Column '{body.target}' was not found in the file.")
    task = body.task or None
    if task not in (None, "regression", "classification"):
        raise HTTPException(400, "Task must be 'regression' or 'classification'.")
    if task is None:
        task = run["profile"]["suggested_task"] if body.target == run["profile"]["suggested_target"] else None
    if task is None:
        from .profiling import infer_task

        task = infer_task(load_csv(str(DATA_DIR / run_id / "raw.csv"))[body.target])
    run.update(status="running", progress=0.0, message="Starting", result=None, error=None, steps=[])
    background.add_task(_train, run_id, body.target, task)
    return {"status": "running"}


@app.get("/api/runs/{run_id}")
def read_run(run_id: str):
    return get_run(run_id)


DOWNLOADS = {
    "model": ("model.joblib", "application/octet-stream"),
    "code": ("train_model.py", "text/x-python"),
    "report": ("report.md", "text/markdown"),
}


@app.get("/api/runs/{run_id}/download/{kind}")
def download(run_id: str, kind: str):
    get_run(run_id)  # also validates the id
    if kind not in DOWNLOADS:
        raise HTTPException(404, "Unknown file type.")
    name, media = DOWNLOADS[kind]
    path = DATA_DIR / run_id / "artifacts" / name
    if not path.exists():
        raise HTTPException(404, "This file was not created. No model is saved when no model beats the baseline.")
    return FileResponse(path, filename=name, media_type=media)
