import numpy as np
import pandas as pd
from fastapi.testclient import TestClient
from sklearn.datasets import make_classification, make_regression

from app.main import app
from app.modeling import run_experiment
from app.profiling import infer_task, profile_dataframe


def regression_df():
    X, y = make_regression(n_samples=300, n_features=5, noise=10, random_state=0)
    df = pd.DataFrame(X, columns=[f"f{i}" for i in range(5)])
    df["city"] = np.random.default_rng(0).choice(["a", "b", "c"], 300)
    df["row_id"] = range(300)
    df["target"] = y
    return df


def test_regression_pipeline_runs_and_drops_id():
    out = run_experiment(regression_df(), "target", "regression")
    assert out["recommendation"]["verdict"] == "ok"
    assert any(d["column"] == "row_id" for d in out["dropped_columns"])
    assert len(out["models"]) == 4


def test_classification_pipeline_runs():
    X, y = make_classification(n_samples=300, n_features=6, random_state=0)
    df = pd.DataFrame(X, columns=[f"f{i}" for i in range(6)])
    df["label"] = np.where(y == 1, "yes", "no")
    out = run_experiment(df, "label", "classification")
    assert out["primary_metric"] == "Macro F1"
    assert out["models"][0]["test"]["accuracy"] > 0.6


def test_noise_target_gets_no_signal_verdict():
    rng = np.random.default_rng(1)
    df = pd.DataFrame(rng.normal(size=(300, 4)), columns=list("abcd"))
    df["target"] = rng.normal(size=300)
    out = run_experiment(df, "target", "regression")
    assert out["recommendation"]["verdict"] == "no_signal"


def test_task_inference_and_profile():
    df = regression_df()
    assert infer_task(df["target"]) == "regression"
    assert profile_dataframe(df)["suggested_target"] == "target"


def test_api_upload_and_train_flow(tmp_path):
    client = TestClient(app)
    csv = regression_df().to_csv(index=False).encode()
    r = client.post("/api/runs", files={"file": ("data.csv", csv, "text/csv")})
    assert r.status_code == 200
    run_id = r.json()["id"]
    assert client.post(f"/api/runs/{run_id}/train", json={"target": "target"}).status_code == 202
    status = client.get(f"/api/runs/{run_id}").json()
    assert status["status"] in {"running", "done"}
    assert client.post("/api/runs", files={"file": ("x.pdf", b"x", "application/pdf")}).status_code == 400
