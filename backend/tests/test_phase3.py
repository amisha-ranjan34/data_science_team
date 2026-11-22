import json
import subprocess
import sys

import joblib
import numpy as np
import pandas as pd
import pytest
from fastapi.testclient import TestClient
from sklearn.datasets import make_classification, make_regression

from app import main
from app.artifacts import build_report
from app.modeling import run_experiment
from app.review import build_review


def noisy_regression(n=400):
    X, y = make_regression(n_samples=n, n_features=5, n_informative=3, noise=60, random_state=1)
    df = pd.DataFrame(X, columns=list("abcde"))
    df["city"] = np.random.default_rng(0).choice(["x", "y", "z"], n)
    df["target"] = y
    return df


def noisy_classification(n=400):
    X, y = make_classification(n_samples=n, n_features=6, n_informative=3, flip_y=0.15, random_state=2)
    df = pd.DataFrame(X, columns=[f"f{i}" for i in range(6)])
    df["label"] = np.where(y == 1, "yes", "no")
    return df


def test_tuning_adds_a_tuned_row():
    out = run_experiment(noisy_regression(), "target", "regression", tune_budget=30)
    tuned = [m for m in out["models"] if m.get("tuned")]
    assert len(tuned) == 1 and tuned[0]["name"].endswith("(tuned)") and tuned[0]["params"]
    assert any("optimistic" in w for w in out["warnings"])
    assert [m["rank"] for m in out["models"]] == list(range(1, len(out["models"]) + 1))


def test_tuning_is_skipped_when_budget_is_zero():
    out = run_experiment(noisy_regression(), "target", "regression", tune_budget=0)
    assert not any(m.get("tuned") for m in out["models"])


def test_reviewer_catches_a_leaking_column():
    df = noisy_regression()
    df["leak"] = df["target"] * 2 + 1
    out = run_experiment(df, "target", "regression")
    assert out["review"]["verdict"] == "fail"
    assert any("leak" in f["title"] and f["severity"] == "high" for f in out["review"]["findings"])


def test_reviewer_passes_clean_noisy_data():
    out = run_experiment(noisy_regression(), "target", "regression")
    assert out["review"]["verdict"] in {"pass", "caution"}
    assert not any(f["severity"] == "high" for f in out["review"]["findings"])


def test_reviewer_flags_overfit_imbalance_and_small_test():
    models = [
        {"name": "Baseline", "complexity": 0, "cv_mean": 0.0, "cv_std": 0.0, "test": {"f1_macro": 0.0}},
        {"name": "Forest", "complexity": 2, "cv_mean": 0.9, "cv_std": 0.02, "test": {"f1_macro": 0.5}},
    ]
    rev = build_review("classification", "Macro F1", models, {"model": "Forest"}, n_test=50, probe=[], majority_share=0.95)
    titles = " | ".join(f["title"] for f in rev["findings"])
    assert rev["verdict"] == "caution"
    assert "much higher" in titles and "imbalanced" in titles and "small" in titles


def test_model_file_and_script_work_for_regression(tmp_path):
    df = noisy_regression()
    out = run_experiment(df, "target", "regression", artifact_dir=tmp_path / "a")
    assert out["artifacts"]["model"] and out["artifacts"]["code"]
    bundle = joblib.load(tmp_path / "a" / "model.joblib")
    assert len(bundle["pipeline"].predict(df[bundle["features"]].head(5))) == 5
    csv = tmp_path / "data.csv"
    df.to_csv(csv, index=False)
    run = subprocess.run([sys.executable, str(tmp_path / "a" / "train_model.py"), str(csv)], cwd=tmp_path, capture_output=True, text=True, timeout=180)
    assert run.returncode == 0, run.stderr
    assert "Test R2" in run.stdout and (tmp_path / "model.joblib").exists()


def test_script_works_for_classification_with_tuned_model(tmp_path):
    df = noisy_classification()
    out = run_experiment(df, "label", "classification", tune_budget=30, artifact_dir=tmp_path / "a")
    assert out["artifacts"]["code"]
    csv = tmp_path / "data.csv"
    df.to_csv(csv, index=False)
    run = subprocess.run([sys.executable, str(tmp_path / "a" / "train_model.py"), str(csv)], cwd=tmp_path, capture_output=True, text=True, timeout=180)
    assert run.returncode == 0, run.stderr
    assert "Test macro F1" in run.stdout


def test_no_model_is_saved_when_nothing_beats_baseline(tmp_path):
    rng = np.random.default_rng(1)
    df = pd.DataFrame(rng.normal(size=(300, 4)), columns=list("abcd"))
    df["target"] = rng.normal(size=300)
    out = run_experiment(df, "target", "regression", artifact_dir=tmp_path / "a")
    assert out["recommendation"]["verdict"] == "no_signal" and out["artifacts"]["model"] is False
    assert not (tmp_path / "a" / "model.joblib").exists()


def test_report_text():
    out = run_experiment(noisy_regression(), "target", "regression")
    out["artifacts"]["report"] = True
    text = build_report(out)
    assert "## Recommendation" in text and "## Review" in text and "bundle[\"pipeline\"].predict" in text


def test_api_run_survives_restart_and_serves_downloads():
    client = TestClient(main.app)
    csv = noisy_regression().to_csv(index=False).encode()
    run_id = client.post("/api/runs", files={"file": ("d.csv", csv, "text/csv")}).json()["id"]
    assert client.post(f"/api/runs/{run_id}/train", json={"target": "target"}).status_code == 202
    main.RUNS.clear()  # simulate a server restart
    run = client.get(f"/api/runs/{run_id}").json()
    assert run["status"] == "done" and run["result"]["artifacts"]["report"] is True
    assert client.get(f"/api/runs/{run_id}/download/report").status_code == 200
    if run["result"]["artifacts"]["model"]:
        assert client.get(f"/api/runs/{run_id}/download/model").status_code == 200
    assert client.get(f"/api/runs/{run_id}/download/virus").status_code == 404
    assert client.get("/api/runs/../../etc/download/model").status_code == 404
    assert client.get("/api/runs/aaaaaaaaaaaa").status_code == 404


def test_interrupted_run_is_reported_as_error(tmp_path):
    run_dir = main.DATA_DIR / "abcdef123456"
    run_dir.mkdir(parents=True)
    (run_dir / "state.json").write_text(json.dumps({"id": "abcdef123456", "status": "running", "error": None, "steps": []}))
    out = TestClient(main.app).get("/api/runs/abcdef123456").json()
    assert out["status"] == "error" and "restarted" in out["error"]
