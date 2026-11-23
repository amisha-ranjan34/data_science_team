import pytest
from fastapi.testclient import TestClient

from app import db, main


@pytest.fixture(autouse=True)
def isolate(monkeypatch, tmp_path):
    """Keep tests fast and tidy: no tuning unless a test asks, and a fresh database and data folder for every test."""
    monkeypatch.setenv("TUNING_BUDGET_SECONDS", "0")
    monkeypatch.setattr(main, "DATA_DIR", tmp_path / "runs")
    db.configure(f"sqlite:///{tmp_path / 'test.db'}")
    yield


@pytest.fixture
def client():
    return TestClient(main.app)


def register(client, email="ada@example.com", password="correct-horse-battery"):
    r = client.post("/api/auth/register", json={"email": email, "password": password})
    assert r.status_code == 201, r.text
    return {"Authorization": f"Bearer {r.json()['token']}"}


@pytest.fixture
def auth(client):
    return register(client)
