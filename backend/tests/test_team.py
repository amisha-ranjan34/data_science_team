import numpy as np
import pandas as pd
import pytest
from sklearn.datasets import make_regression

from app import llm as llm_mod
from app.llm import LLM, LLMUnavailable, explain_error
from app.team import DropColumn, PlanOut, WhatIfPlanOut, default_plan, make_what_if_plan, run_team, validate_plan


def skewed_df(n=300):
    X, y = make_regression(n_samples=n, n_features=4, noise=5, random_state=0)
    df = pd.DataFrame(X, columns=list("abcd"))
    df["price"] = np.exp((y - y.min()) / (y.max() - y.min()) * 4)  # positive and right-skewed
    return df


class OfflineLLM:
    enabled = False

    def info(self):
        return {"enabled": False, "provider": None, "model": None}

    def text(self, *a, **k):
        raise LLMUnavailable("No API key is set")

    structured = text


class StubLLM(OfflineLLM):
    enabled = True

    def info(self):
        return {"enabled": True, "provider": "stub", "model": "stub-1"}

    def text(self, *a, **k):
        return "Stub explanation."

    def structured(self, *a, **k):
        return PlanOut(
            models=["linear", "gradient_boosting", "made_up_model"],
            target_transform="log",
            drop_columns=[DropColumn(column="d", reason="test drop"), DropColumn(column="ghost", reason="not a column")],
            rationale="Stub plan.",
        )


def collect():
    steps = {}
    return steps, lambda e: steps.__setitem__(e["id"], e)


def test_default_plan_logs_skewed_target():
    assert default_plan(skewed_df(), "price", "regression")["target_transform"] == "log"


def test_validate_plan_strips_unsafe_parts():
    df = skewed_df()
    raw = PlanOut(models=["bogus"], target_transform="log", drop_columns=[DropColumn(column="price", reason="x")], rationale="r")
    plan = validate_plan(raw, df, "price", "regression")
    assert set(plan["models"]) == {"linear", "random_forest", "gradient_boosting"}
    assert plan["drop_columns"] == []
    df["price"] = df["price"] - 10  # now has negatives, so log must be refused
    assert validate_plan(raw, df, "price", "regression")["target_transform"] == "none"


def test_what_if_plan_validates_ai_columns_and_preserves_original_plan(monkeypatch):
    profile = {"columns": [{"name": "price"}, {"name": "city"}, {"name": "id"}]}

    class WhatIfStub(OfflineLLM):
        def structured(self, *args, **kwargs):
            return WhatIfPlanOut(drop_columns=["CITY"], rationale="Compare without city.")

    monkeypatch.setattr(llm_mod, "_llm", WhatIfStub())
    base = {"models": ["linear"], "target_transform": "none", "drop_columns": [], "rationale": "Original", "source": "ai"}
    plan = make_what_if_plan(profile, "price", "What if city was removed?", base)
    assert plan["models"] == ["linear"] and plan["source"] == "what-if"
    assert plan["drop_columns"] == [{"column": "city", "reason": "What-if scenario: Compare without city."}]

    class UnsafeWhatIfStub(OfflineLLM):
        def structured(self, *args, **kwargs):
            return WhatIfPlanOut(drop_columns=["price"], rationale="Drop the target.")

    monkeypatch.setattr(llm_mod, "_llm", UnsafeWhatIfStub())
    with pytest.raises(ValueError, match="unavailable feature"):
        make_what_if_plan(profile, "price", "What if the target is removed?", base)


def test_team_runs_offline_with_fallbacks(monkeypatch):
    monkeypatch.setattr(llm_mod, "_llm", OfflineLLM())
    steps, emit = collect()
    out = run_team(skewed_df(), "price", "regression", emit, lambda f, m: None)
    assert out["plan"]["source"] == "default" and out["ai"]["enabled"] is False
    assert steps["planner"]["status"] == "skipped" and steps["advisor"]["status"] == "skipped"
    assert steps["cleaner"]["status"] == "done" and steps["model:linear"]["status"] == "done"
    assert out["recommendation"]["verdict"] in {"ok", "no_signal"}


def test_team_uses_ai_plan_and_explanation(monkeypatch):
    monkeypatch.setattr(llm_mod, "_llm", StubLLM())
    steps, emit = collect()
    out = run_team(skewed_df(), "price", "regression", emit, lambda f, m: None)
    assert out["plan"]["source"] == "ai" and out["plan"]["models"] == ["linear", "gradient_boosting"]
    assert [m["name"] for m in out["models"] if m["complexity"] > 0 and m["name"] == "Random forest"] == []
    assert any(d["column"] == "d" for d in out["dropped_columns"])
    assert out["recommendation"]["explanation"] == "Stub explanation."
    assert steps["planner"]["status"] == "done" and steps["advisor"]["status"] == "done"


def test_real_agno_failure_falls_back_cleanly(monkeypatch):
    """A fake key and no network must produce a clean fallback, never a crash."""
    monkeypatch.setenv("LLM_PROVIDER", "openai")
    monkeypatch.setenv("OPENAI_API_KEY", "sk-fake")
    monkeypatch.setenv("LLM_TIMEOUT_SECONDS", "8")
    real = LLM()
    assert real.enabled and real.provider == "openai"
    with pytest.raises(LLMUnavailable):
        real.text("t", "i", "p")


def test_provider_detection(monkeypatch):
    for k in ("LLM_PROVIDER", "GROQ_API_KEY", "GOOGLE_API_KEY", "GEMINI_API_KEY", "OPENAI_API_KEY", "ANTHROPIC_API_KEY"):
        monkeypatch.delenv(k, raising=False)
    assert LLM().enabled is False
    monkeypatch.setenv("GROQ_API_KEY", "gsk-x")
    assert LLM().provider == "groq"


def test_gemini_key_alias_and_hint(monkeypatch):
    for k in ("LLM_PROVIDER", "GROQ_API_KEY", "GOOGLE_API_KEY", "GEMINI_API_KEY", "OPENAI_API_KEY", "ANTHROPIC_API_KEY"):
        monkeypatch.delenv(k, raising=False)
    off = LLM()
    assert off.enabled is False and off.info()["hint"]
    monkeypatch.setenv("GEMINI_API_KEY", '"abc123"')
    on = LLM()
    assert on.provider == "gemini" and on.info()["hint"] is None


@pytest.mark.parametrize(
    "raw, expected",
    [
        ("Error code: 401 - Invalid API Key", "rejected the API key"),
        ("429 rate limit exceeded", "Rate limit"),
        ("The model `x` has been decommissioned", "model name"),
        ("Connection error.", "Cannot reach"),
        ("something odd", "check_ai.py"),
    ],
)
def test_explain_error_is_friendly_and_hides_raw_text(raw, expected):
    msg = explain_error(raw)
    assert expected in msg and raw not in msg