import pytest

from app import main


@pytest.fixture(autouse=True)
def isolate(monkeypatch, tmp_path):
    """Keep tests fast and tidy: no tuning unless a test asks for it, and runs are saved in a temp folder."""
    monkeypatch.setenv("TUNING_BUDGET_SECONDS", "0")
    monkeypatch.setattr(main, "DATA_DIR", tmp_path / "runs")
    main.RUNS.clear()
    yield
    main.RUNS.clear()
