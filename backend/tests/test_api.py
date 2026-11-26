import json
import hashlib
from datetime import timedelta
from pathlib import Path

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
    assert r.status_code == 201 and r.json()["email"] == "ada@example.com"
    assert r.json()["verification_token"]
    assert client.post("/api/auth/login", json={"email": "ada@example.com", "password": "long-enough-1"}).status_code == 403
    verified = client.post("/api/auth/verify-email", json={"token": r.json()["verification_token"]})
    assert verified.status_code == 200 and verified.json()["user"]["email"] == "ada@example.com"
    session_cookie = next(v for v in verified.headers.get_list("set-cookie") if v.startswith("adst_session="))
    assert "httponly" in session_cookie.lower()
    ok = client.post("/api/auth/login", json={"email": "ada@example.com", "password": "long-enough-1"})
    assert ok.status_code == 200 and "token" not in ok.json()
    me = client.get("/api/auth/me")
    assert me.json()["email"] == "ada@example.com"


def test_production_auth_cookies_are_secure(client, monkeypatch):
    monkeypatch.setenv("ENV", "production")
    monkeypatch.setenv("SECRET_KEY", "a" * 48)
    monkeypatch.setenv("AUTH_COOKIE_SAMESITE", "none")
    with db.session_scope() as session:
        session.add(
            db.User(
                email="ada@example.com",
                password_hash=hash_password("long-enough-1"),
                email_verified=True,
            )
        )
        session.commit()
    response = client.post("/api/auth/login", json={"email": "ada@example.com", "password": "long-enough-1"})
    assert response.status_code == 200
    cookie = next(value for value in response.headers.get_list("set-cookie") if value.startswith("adst_session="))
    assert "httponly" in cookie.lower() and "secure" in cookie.lower() and "samesite=none" in cookie.lower()


def test_email_verification_token_is_one_time_and_expiring(client):
    registration = client.post(
        "/api/auth/register",
        json={"email": "ada@example.com", "password": "long-enough-1"},
    ).json()
    token = registration["verification_token"]
    assert client.post("/api/auth/verify-email", json={"token": "x" * 43}).status_code == 400
    assert client.post("/api/auth/verify-email", json={"token": token}).status_code == 200
    assert client.post("/api/auth/verify-email", json={"token": token}).status_code == 400

    expired = client.post(
        "/api/auth/register",
        json={"email": "grace@example.com", "password": "long-enough-1"},
    ).json()["verification_token"]
    with db.session_scope() as s:
        row = s.query(db.EmailVerificationToken).filter_by(token_hash=hashlib.sha256(expired.encode()).hexdigest()).one()
        row.expires_at = db.utcnow() - timedelta(seconds=1)
        s.commit()
    assert client.post("/api/auth/verify-email", json={"token": expired}).status_code == 400


def test_smtp_verification_message_uses_frontend_url(monkeypatch):
    from app import main as app_main

    sent = []

    class FakeSMTP:
        def __init__(self, host, port, timeout):
            assert (host, port, timeout) == ("mail.example.test", 587, 10)

        def __enter__(self):
            return self

        def __exit__(self, *args):
            pass

        def ehlo(self):
            pass

        def starttls(self, context):
            pass

        def login(self, username, password):
            assert (username, password) == ("mailer", "password")

        def send_message(self, message):
            sent.append(message)

    monkeypatch.setenv("SMTP_HOST", "mail.example.test")
    monkeypatch.setenv("SMTP_FROM", "no-reply@example.test")
    monkeypatch.setenv("SMTP_USERNAME", "mailer")
    monkeypatch.setenv("SMTP_PASSWORD", "password")
    monkeypatch.setenv("SMTP_PORT", "587")
    monkeypatch.setenv("SMTP_STARTTLS", "true")
    monkeypatch.setenv("FRONTEND_URL", "https://app.example.test/")
    monkeypatch.setattr(app_main.smtplib, "SMTP", FakeSMTP)
    app_main._send_verification_email("ada@example.test", "abc-def")
    assert sent[0]["To"] == "ada@example.test"
    assert "https://app.example.test/?verify=abc-def" in sent[0].get_content()


def test_resend_verification_hides_unknown_accounts_and_returns_dev_code(client):
    unknown = client.post("/api/auth/resend-verification", json={"email": "unknown@example.com"})
    assert unknown.status_code == 202 and "verification_token" not in unknown.json()
    client.post("/api/auth/register", json={"email": "ada@example.com", "password": "long-enough-1"})
    resend = client.post("/api/auth/resend-verification", json={"email": "ada@example.com"})
    assert resend.status_code == 202 and resend.json()["verification_token"]
    assert client.post("/api/auth/verify-email", json={"token": resend.json()["verification_token"]}).status_code == 200


def test_production_registration_requires_smtp(client, monkeypatch):
    monkeypatch.setenv("ENV", "production")
    monkeypatch.setenv("SECRET_KEY", "a" * 48)
    monkeypatch.delenv("SMTP_HOST", raising=False)
    monkeypatch.delenv("SMTP_FROM", raising=False)
    response = client.post("/api/auth/register", json={"email": "ada@example.com", "password": "long-enough-1"})
    assert response.status_code == 503


def test_existing_accounts_are_marked_verified_during_schema_upgrade(tmp_path):
    from sqlalchemy import create_engine, text

    path = tmp_path / "legacy.db"
    engine = create_engine(f"sqlite:///{path}")
    with engine.begin() as connection:
        connection.execute(
            text(
                "CREATE TABLE users (id INTEGER PRIMARY KEY, email VARCHAR(255) NOT NULL, "
                "password_hash VARCHAR(255) NOT NULL, created_at DATETIME NOT NULL)"
            )
        )
        connection.execute(
            text("INSERT INTO users (id, email, password_hash, created_at) VALUES (1, 'old@example.com', 'hash', '2020-01-01')")
        )
    engine.dispose()
    db.configure(f"sqlite:///{path}")
    with db.session_scope() as session:
        assert session.get(db.User, 1).email_verified is True


def test_cookie_auth_requires_csrf_for_mutations(client):
    registration = client.post("/api/auth/register", json={"email": "ada@example.com", "password": "long-enough-1"})
    client.post("/api/auth/verify-email", json={"token": registration.json()["verification_token"]})
    assert client.get("/api/auth/me").status_code == 200
    assert client.post("/api/runs", files={"file": ("d.csv", csv_bytes(), "text/csv")}).status_code == 403
    csrf = client.cookies.get("adst_csrf")
    client.cookies.set("adst_csrf", "attacker-controlled")
    assert client.post(
        "/api/runs",
        files={"file": ("d.csv", csv_bytes(), "text/csv")},
        headers={"X-CSRF-Token": "attacker-controlled"},
    ).status_code == 403
    client.cookies.set("adst_csrf", csrf)
    response = client.post(
        "/api/runs",
        files={"file": ("d.csv", csv_bytes(), "text/csv")},
        headers={"X-CSRF-Token": csrf},
    )
    assert response.status_code == 200
    assert client.post("/api/auth/logout", headers={"X-CSRF-Token": csrf}).status_code == 204
    assert client.get("/api/auth/me").status_code == 401


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


def test_what_if_reuses_profile_and_compares_a_feature_drop(client, auth, monkeypatch):
    from app.llm import LLMUnavailable
    from app import team

    class DisabledLLM:
        enabled = False

        def info(self):
            return {"enabled": False, "provider": None, "model": None, "hint": "test"}

        def structured(self, *args, **kwargs):
            raise LLMUnavailable("disabled for test")

        def text(self, *args, **kwargs):
            raise LLMUnavailable("disabled for test")

    monkeypatch.setattr(team.llm_mod, "get_llm", lambda: DisabledLLM())
    parent_id = upload(client, auth).json()["id"]
    client.post(f"/api/runs/{parent_id}/train", json={"target": "target"}, headers=auth)
    parent = client.get(f"/api/runs/{parent_id}", headers=auth).json()
    child_response = client.post(
        f"/api/runs/{parent_id}/what-if",
        json={"question": "What if I drop the city column?"},
        headers=auth,
    )
    assert child_response.status_code == 202
    child = client.get(f"/api/runs/{child_response.json()['id']}", headers=auth).json()
    assert child["status"] == "done"
    assert child["parent_run_id"] == parent_id and child["scenario"] == "What if I drop the city column?"
    assert child["profile"] == parent["profile"]
    assert child["result"]["what_if"]["baseline_model"] == parent["result"]["recommendation"]["model"]
    assert child["result"]["plan"]["source"] == "what-if"
    assert next(step for step in child["steps"] if step["id"] == "profiler")["status"] == "skipped"
    assert any(item["column"] == "city" for item in child["result"]["dropped_columns"])
    assert client.get(f"/api/runs/{parent_id}", headers=auth).json()["result"] == parent["result"]


def test_what_if_rejects_unknown_and_target_columns(client, auth, monkeypatch):
    from app.llm import LLMUnavailable
    from app import team

    class DisabledLLM:
        enabled = False

        def info(self):
            return {"enabled": False, "provider": None, "model": None, "hint": "test"}

        def structured(self, *args, **kwargs):
            raise LLMUnavailable("disabled for test")

    monkeypatch.setattr(team.llm_mod, "get_llm", lambda: DisabledLLM())
    run_id = upload(client, auth).json()["id"]
    client.post(f"/api/runs/{run_id}/train", json={"target": "target"}, headers=auth)
    for question in ("What if I drop the missing column?", "What if I drop the target column?"):
        response = client.post(f"/api/runs/{run_id}/what-if", json={"question": question}, headers=auth)
        assert response.status_code == 400


def test_s3_artifacts_upload_download_and_delete(client, auth, monkeypatch):
    from app import storage

    objects = {}

    class Body:
        def __init__(self, value):
            self.value = value

        def iter_chunks(self, chunk_size):
            yield self.value

        def close(self):
            pass

    class FakeS3:
        def upload_file(self, path, bucket, key):
            objects[key] = Path(path).read_bytes()

        def get_object(self, Bucket, Key):
            return {"Body": Body(objects[Key])}

        def get_paginator(self, operation):
            class Paginator:
                def paginate(self, Bucket, Prefix):
                    yield {"Contents": [{"Key": key} for key in objects if key.startswith(Prefix)]}

            return Paginator()

        def delete_objects(self, Bucket, Delete):
            for item in Delete["Objects"]:
                objects.pop(item["Key"], None)

    monkeypatch.setenv("ARTIFACT_STORAGE", "s3")
    monkeypatch.setenv("ARTIFACT_BUCKET", "test-bucket")
    monkeypatch.setattr(storage, "_s3_client", lambda: FakeS3())
    run_id = upload(client, auth).json()["id"]
    client.post(f"/api/runs/{run_id}/train", json={"target": "target"}, headers=auth)
    assert f"runs/{run_id}/artifacts/report.md" in objects
    assert not (main.DATA_DIR / run_id / "artifacts").exists()
    report = client.get(f"/api/runs/{run_id}/download/report", headers=auth)
    assert report.status_code == 200 and report.content.startswith(b"# Model report")
    assert client.delete(f"/api/runs/{run_id}", headers=auth).status_code == 204
    assert not any(key.startswith(f"runs/{run_id}/artifacts/") for key in objects)


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
    client.cookies.clear()
    assert client.get(f"/api/runs/{run_id}/events").status_code == 401
