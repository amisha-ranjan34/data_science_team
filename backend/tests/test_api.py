import json

import numpy as np
import pandas as pd
import pytest
from sklearn.datasets import make_regression

from app import db, main
from app.auth import hash_password, verify_password
from tests.conftest import register


def csv_bytes(n=300):
    X, y = make_regression(n_samples=n, n_features=4, n_informative=3, noise=60, random_state=1)
    df = pd.DataFrame(X, columns=list("abcd"))
    df["city"] = np.random.default_rng(0).choice(["x", "y", "z"], n)
    df["target"] = y
    return df.to_csv(index=False).encode()


def upload(client, headers, name="d.csv"):
    return client.post("/api/runs", files={"file": (name, csv_bytes(), "text/csv")}, headers=headers)


# ---------- accounts ----------

def test_password_hash_is_salted_and_verifies():
    h1, h2 = hash_password("secret-password"), hash_password("secret-password")
    assert h1 != h2 and "secret-password" not in h1
    assert verify_password("secret-password", h1) and not verify_password("wrong", h1)
    assert verify_password("x", "garbage") is False


def test_register_login_me(client):
    r = client.post("/api/auth/register", json={"email": " Ada@Example.com ", "password": "long-enough-1"})
    assert r.status_code == 201 and r.json()["user"]["email"] == "ada@example.com"
    ok = client.post("/api/auth/login", json={"email": "ada@example.com", "password": "long-enough-1"})
    assert ok.status_code == 200
    me = client.get("/api/auth/me", headers={"Authorization": f"Bearer {ok.json()['token']}"})
    assert me.json()["email"] == "ada@example.com"


def test_register_rules(client):
    assert client.post("/api/auth/register", json={"email": "nope", "password": "long-enough-1"}).status_code == 400
    assert client.post("/api/auth/register", json={"email": "a@b.co", "password": "short"}).status_code == 400
    register(client, "dup@example.com")
    assert client.post("/api/auth/register", json={"email": "DUP@example.com", "password": "long-enough-1"}).status_code == 409


def test_login_failures_look_the_same(client):
    register(client, "ada@example.com", "long-enough-1")
    wrong_pw = client.post("/api/auth/login", json={"email": "ada@example.com", "password": "nope-nope-nope"})
    no_user = client.post("/api/auth/login", json={"email": "ghost@example.com", "password": "nope-nope-nope"})
    assert wrong_pw.status_code == no_user.status_code == 401 and wrong_pw.json() == no_user.json()


def test_registration_can_be_closed(client, monkeypatch):
    monkeypatch.setenv("ALLOW_REGISTRATION", "false")
    assert client.post("/api/auth/register", json={"email": "a@b.co", "password": "long-enough-1"}).status_code == 403


def test_endpoints_need_a_valid_token(client):
    assert client.get("/api/runs").status_code == 401
    assert client.post("/api/runs", files={"file": ("d.csv", b"a,b\n1,2", "text/csv")}).status_code == 401
    assert client.get("/api/runs", headers={"Authorization": "Bearer not.a.token"}).status_code == 401
    assert client.get("/api/health").status_code == 200 and client.get("/api/config").status_code == 200


def test_production_requires_a_secret(monkeypatch):
    from app.auth import secret

    monkeypatch.delenv("SECRET_KEY", raising=False)
    monkeypatch.setenv("ENV", "production")
    with pytest.raises(RuntimeError):
        secret()


# ---------- runs ----------

def test_full_flow_with_history_downloads_and_delete(client, auth):
    run_id = upload(client, auth).json()["id"]
    assert client.post(f"/api/runs/{run_id}/train", json={"target": "target"}, headers=auth).status_code == 202
    run = client.get(f"/api/runs/{run_id}", headers=auth).json()
    assert run["status"] == "done" and run["result"]["artifacts"]["report"] is True and run["steps"]

    history = client.get("/api/runs", headers=auth).json()
    assert history[0]["id"] == run_id and history[0]["target"] == "target" and history[0]["status"] == "done"

    assert client.get(f"/api/runs/{run_id}/download/report", headers=auth).status_code == 200
    assert client.get(f"/api/runs/{run_id}/download/virus", headers=auth).status_code == 404

    assert client.delete(f"/api/runs/{run_id}", headers=auth).status_code == 204
    assert client.get(f"/api/runs/{run_id}", headers=auth).status_code == 404
    assert not (main.DATA_DIR / run_id).exists()


def test_users_cannot_see_each_others_runs(client, auth):
    run_id = upload(client, auth).json()["id"]
    other = register(client, "grace@example.com")
    assert client.get(f"/api/runs/{run_id}", headers=other).status_code == 404
    assert client.post(f"/api/runs/{run_id}/train", json={"target": "target"}, headers=other).status_code == 404
    assert client.get(f"/api/runs/{run_id}/download/report", headers=other).status_code == 404
    assert client.delete(f"/api/runs/{run_id}", headers=other).status_code == 404
    assert client.get("/api/runs", headers=other).json() == []


def test_bad_ids_and_inputs(client, auth):
    assert client.get("/api/runs/aaaaaaaaaaaa", headers=auth).status_code == 404
    assert client.get("/api/runs/..%2F..%2Fetc", headers=auth).status_code == 404
    assert upload(client, auth, "x.pdf").status_code == 400
    run_id = upload(client, auth).json()["id"]
    assert client.post(f"/api/runs/{run_id}/train", json={"target": "nope"}, headers=auth).status_code == 400
    assert client.post(f"/api/runs/{run_id}/train", json={"target": "target", "task": "magic"}, headers=auth).status_code == 400


def test_daily_upload_limit(client, auth, monkeypatch):
    monkeypatch.setenv("MAX_RUNS_PER_DAY", "2")
    assert upload(client, auth).status_code == 200 and upload(client, auth).status_code == 200
    assert upload(client, auth).status_code == 429


def test_only_one_training_at_a_time(client, auth):
    run_id = upload(client, auth).json()["id"]
    other_id = upload(client, auth).json()["id"]
    db.update_run(other_id, status="running")
    assert client.post(f"/api/runs/{run_id}/train", json={"target": "target"}, headers=auth).status_code == 409


def test_restart_marks_running_runs_as_failed(client, auth):
    run_id = upload(client, auth).json()["id"]
    db.update_run(run_id, status="running")
    assert db.mark_interrupted() == 1
    run = client.get(f"/api/runs/{run_id}", headers=auth).json()
    assert run["status"] == "error" and "restarted" in run["error"]


def test_bad_target_surfaces_a_readable_error(client, auth):
    run_id = upload(client, auth).json()["id"]
    client.post(f"/api/runs/{run_id}/train", json={"target": "city", "task": "regression"}, headers=auth)
    run = client.get(f"/api/runs/{run_id}", headers=auth).json()
    assert run["status"] == "error" and "non-numeric" in run["error"]


def test_health_reports_database(client):
    assert client.get("/api/health").json() == {"status": "ok", "database": "ok"}


def test_postgres_urls_are_normalised():
    assert db.normalize_url("postgres://u:p@h/d") == "postgresql+psycopg://u:p@h/d"
    assert db.normalize_url("sqlite:///x.db") == "sqlite:///x.db"


def sse_payloads(response):
    return [json.loads(line[6:]) for line in response.iter_lines() if line.startswith("data: ")]


def test_events_stream_a_finished_run_once_and_close(client, auth):
    run_id = upload(client, auth).json()["id"]
    client.post(f"/api/runs/{run_id}/train", json={"target": "target"}, headers=auth)
    with client.stream("GET", f"/api/runs/{run_id}/events", headers=auth) as r:
        assert r.status_code == 200 and r.headers["content-type"].startswith("text/event-stream")
        events = sse_payloads(r)
    assert len(events) == 1 and events[0]["status"] == "done" and events[0]["result"]["redteam"] is not None


def test_events_follow_a_running_run_until_it_finishes(client, auth):
    import threading

    run_id = upload(client, auth).json()["id"]
    db.update_run(run_id, status="running", progress=0.2, message="Training")
    timer = threading.Timer(0.8, lambda: db.update_run(run_id, status="done", progress=1.0, message="Done"))
    timer.start()
    with client.stream("GET", f"/api/runs/{run_id}/events", headers=auth) as r:
        events = sse_payloads(r)
    timer.join()
    assert [e["status"] for e in events] == ["running", "done"] and events[0]["progress"] == 0.2


def test_events_respect_ownership_and_login(client, auth):
    run_id = upload(client, auth).json()["id"]
    other = register(client, "grace@example.com")
    assert client.get(f"/api/runs/{run_id}/events", headers=other).status_code == 404
    assert client.get(f"/api/runs/{run_id}/events").status_code == 401
