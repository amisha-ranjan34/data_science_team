"""FastAPI app: upload a CSV, pick a target, train models in the background, poll for results."""
from __future__ import annotations

import json
import os
import uuid
from pathlib import Path

import httpx
from fastapi import BackgroundTasks, FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from .llm import get_llm
from .team import run_team
from .profiling import load_csv, profile_dataframe

DATA_DIR = Path(__file__).resolve().parent.parent / "data" / "runs"
MAX_BYTES = 20 * 1024 * 1024
RUNS: dict[str, dict] = {}  # In-memory cache backed by on-disk persistence

app = FastAPI(title="Auto Data Science Team", version="0.1.0")
origins = os.getenv("ALLOWED_ORIGINS", "http://localhost:3000,http://127.0.0.1:3000").split(",")
app.add_middleware(CORSMiddleware, allow_origins=origins, allow_methods=["*"], allow_headers=["*"])


class TrainRequest(BaseModel):
    target: str
    task: str | None = None  # "regression" or "classification"; defaults to the profiled guess


class UrlRequest(BaseModel):
    url: str


def _run_file(run_id: str) -> Path:
    return DATA_DIR / run_id / "run.json"


def save_run(run: dict) -> None:
    """Save run to in-memory dictionary and persist to disk as run.json."""
    run_id = run["id"]
    RUNS[run_id] = run
    run_dir = DATA_DIR / run_id
    run_dir.mkdir(parents=True, exist_ok=True)
    try:
        with open(_run_file(run_id), "w", encoding="utf-8") as f:
            json.dump(run, f, indent=2)
    except Exception:
        pass


def get_run(run_id: str) -> dict:
    """Get run from memory, disk run.json, or reconstruct from raw.csv if server restarted."""
    run = RUNS.get(run_id)
    if run is not None:
        return run

    # 1. Try loading from on-disk run.json
    run_path = _run_file(run_id)
    if run_path.exists():
        try:
            with open(run_path, "r", encoding="utf-8") as f:
                saved = json.load(f)
                RUNS[run_id] = saved
                return saved
        except Exception:
            pass

    # 2. If raw.csv exists, automatically re-profile and reconstruct the run
    csv_path = DATA_DIR / run_id / "raw.csv"
    if csv_path.exists():
        try:
            profile = profile_dataframe(load_csv(str(csv_path)))
            reconstructed = {
                "id": run_id,
                "filename": "dataset.csv",
                "status": "profiled",
                "progress": 0.0,
                "message": "",
                "profile": profile,
                "result": None,
                "error": None,
                "steps": [],
            }
            save_run(reconstructed)
            return reconstructed
        except Exception:
            pass

    raise HTTPException(404, "This run was not found. Upload the file again.")


@app.get("/")
def root():
    return {"status": "ok", "app": "Auto Data Science Team API"}


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
    run = {
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
    save_run(run)
    return run


@app.post("/api/runs/from-url")
async def create_run_from_url(body: UrlRequest):
    url = body.url.strip()
    if not url.startswith(("http://", "https://")):
        raise HTTPException(400, "Please provide a valid URL starting with http:// or https://")

    # Determine a clean filename
    clean_url = url.split("?")[0].split("#")[0]
    filename = clean_url.rstrip("/").split("/")[-1] or "dataset.csv"
    if not filename.lower().endswith((".csv", ".tsv", ".txt")):
        filename += ".csv"

    run_id = uuid.uuid4().hex[:12]
    run_dir = DATA_DIR / run_id
    run_dir.mkdir(parents=True, exist_ok=True)
    path = run_dir / "raw.csv"

    try:
        async with httpx.AsyncClient(timeout=30.0, follow_redirects=True) as client:
            async with client.stream("GET", url) as response:
                if response.status_code != 200:
                    raise HTTPException(400, f"Failed to download dataset. Server returned HTTP {response.status_code}.")

                size = 0
                with open(path, "wb") as out:
                    async for chunk in response.aiter_bytes(chunk_size=1024 * 1024):
                        size += len(chunk)
                        if size > MAX_BYTES:
                            out.close()
                            path.unlink(missing_ok=True)
                            raise HTTPException(413, "The file exceeds the 20 MB size limit.")
                        out.write(chunk)
    except HTTPException:
        raise
    except httpx.RequestError as exc:
        path.unlink(missing_ok=True)
        raise HTTPException(400, f"Could not reach dataset URL: {str(exc)}") from exc
    except Exception as exc:
        path.unlink(missing_ok=True)
        raise HTTPException(400, f"Error fetching dataset: {str(exc)}") from exc

    try:
        profile = profile_dataframe(load_csv(str(path)))
    except ValueError as exc:
        path.unlink(missing_ok=True)
        raise HTTPException(400, str(exc)) from exc

    run = {
        "id": run_id,
        "filename": filename,
        "status": "profiled",
        "progress": 0.0,
        "message": "",
        "profile": profile,
        "result": None,
        "error": None,
        "steps": [],
    }
    save_run(run)
    return run


def _train(run_id: str, target: str, task: str) -> None:
    run = get_run(run_id)

    def progress(fraction: float, message: str) -> None:
        run["progress"], run["message"] = fraction, message
        save_run(run)

    def emit(step: dict) -> None:  # add a step, or update it when the id already exists
        for i, existing in enumerate(run["steps"]):
            if existing["id"] == step["id"]:
                run["steps"][i] = step
                save_run(run)
                return
        run["steps"].append(step)
        save_run(run)

    try:
        df = load_csv(str(DATA_DIR / run_id / "raw.csv"))
        run["result"] = run_team(df, target, task, emit, progress)
        run["status"] = "done"
        save_run(run)
    except Exception as exc:  # surfaced to the UI as a readable message
        run["error"] = str(exc) if isinstance(exc, ValueError) else "Training failed unexpectedly. Check the server logs."
        run["status"] = "error"
        save_run(run)
        if not isinstance(exc, ValueError):
            raise


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
    save_run(run)
    background.add_task(_train, run_id, body.target, task)
    return {"status": "running"}


@app.get("/api/runs/{run_id}")
def read_run(run_id: str):
    return get_run(run_id)
