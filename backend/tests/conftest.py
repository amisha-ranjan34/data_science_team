import pytest
from fastapi.testclient import TestClient

from app import db, main


@pytest.fixture(autouse=True)
def isolate(monkeypatch, tmp_path):
    """Keep tests fast and tidy: no tuning unless a test asks, and a fresh database and data folder for every test."""
    monkeypatch.setenv("TUNING_BUDGET_SECONDS", "0")
    monkeypatch.setenv("ENV", "dev")
    monkeypatch.delenv("SECRET_KEY", raising=False)
    monkeypatch.setattr(main, "DATA_DIR", tmp_path / "runs")
    from app import llm

    monkeypatch.setattr(llm, "_llm", None)
    for key in ("LLM_PROVIDER", "GROQ_API_KEY", "GOOGLE_API_KEY", "GEMINI_API_KEY", "OPENAI_API_KEY", "ANTHROPIC_API_KEY"):
        monkeypatch.delenv(key, raising=False)
    for key in ("SMTP_HOST", "SMTP_FROM", "SMTP_USERNAME", "SMTP_PASSWORD"):
        monkeypatch.delenv(key, raising=False)
    db.configure(f"sqlite:///{tmp_path / 'test.db'}")
    yield


@pytest.fixture
def client():
    return TestClient(main.app)


def register(client, email="ada@example.com", password="correct-horse-battery"):
    r = client.post("/api/auth/register", json={"email": email, "password": password})
    assert r.status_code == 201, r.text
    token = r.json().get("verification_token")
    if token:
        verified = client.post("/api/auth/verify-email", json={"token": token})
        assert verified.status_code == 200, verified.text
    return {"Authorization": f"Bearer {client.cookies.get('adst_session')}"}


@pytest.fixture
def auth(client):
    return register(client)
