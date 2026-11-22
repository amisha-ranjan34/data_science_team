"""The agent team: Profiler, Planner, Cleaner, Modeler and Advisor.

The LLM agents (Profiler, Planner, Advisor) only produce text and a validated plan. All ML work is done by tested code,
so a bad LLM answer can never break a run: every agent step has a rule-based fallback.
"""
from __future__ import annotations

import json
import os
from pathlib import Path
from typing import Callable, Literal

import pandas as pd
from pydantic import BaseModel, Field

from . import artifacts
from . import llm as llm_mod
from .llm import LLMUnavailable
from .modeling import run_experiment
from .profiling import profile_dataframe

Emit = Callable[[dict], None]
Progress = Callable[[float, str], None]
MODEL_KEYS = ("linear", "random_forest", "gradient_boosting")


class DropColumn(BaseModel):
    column: str
    reason: str


class PlanOut(BaseModel):
    """What the Planner agent must return."""

    models: list[str] = Field(description=f"Models to try, chosen from {list(MODEL_KEYS)}")
    target_transform: Literal["none", "log"] = Field(description="Use 'log' only for a positive, right-skewed numeric target")
    drop_columns: list[DropColumn] = Field(default_factory=list, description="Extra feature columns to drop, with a reason")
    rationale: str = Field(description="Two sentences explaining the plan in plain language")


# ---------- helpers ----------

def target_stats(y: pd.Series, task: str) -> dict:
    if task == "regression":
        y = pd.to_numeric(y, errors="coerce").dropna()
        return {"min": float(y.min()), "max": float(y.max()), "mean": round(float(y.mean()), 3), "skew": round(float(y.skew()), 2)}
    return {"class_counts": {str(k): int(v) for k, v in y.astype(str).value_counts().head(10).items()}}


def default_plan(df: pd.DataFrame, target: str, task: str) -> dict:
    stats = target_stats(df[target], task)
    log = task == "regression" and stats["min"] >= 0 and stats["skew"] > 1.0
    why = "Try every model and compare them fairly."
    if log:
        why += f" The target is right-skewed (skew {stats['skew']}), so it is modelled on a log scale."
    return {"models": list(MODEL_KEYS), "target_transform": "log" if log else "none", "drop_columns": [], "rationale": why, "source": "default"}


def validate_plan(raw: PlanOut, df: pd.DataFrame, target: str, task: str) -> dict:
    """Keep only what the code can safely execute."""
    models = [m for m in dict.fromkeys(raw.models) if m in MODEL_KEYS] or list(MODEL_KEYS)
    transform = raw.target_transform
    if transform == "log":
        y = pd.to_numeric(df[target], errors="coerce")
        if task != "regression" or y.isna().any() or y.min() < 0:
            transform = "none"
    drops = [
        {"column": d.column, "reason": d.reason[:160]}
        for d in raw.drop_columns[:10]
        if d.column in df.columns and d.column != target
    ]
    return {"models": models, "target_transform": transform, "drop_columns": drops, "rationale": raw.rationale[:500], "source": "ai"}


def _reason(exc: Exception) -> str:
    return str(exc) if isinstance(exc, LLMUnavailable) else f"Unexpected error ({exc.__class__.__name__})"


# ---------- the run ----------

def run_team(
    df: pd.DataFrame,
    target: str,
    task: str,
    emit: Emit,
    progress: Progress,
    artifact_dir: Path | None = None,
    tune_budget: float | None = None,
) -> dict:
    llm = llm_mod.get_llm()
    if tune_budget is None:
        tune_budget = float(os.getenv("TUNING_BUDGET_SECONDS", "45"))  # 0 switches tuning off

    def step(id_: str, agent: str, title: str, status: str, detail: str = "") -> None:
        emit({"id": id_, "agent": agent, "title": title, "status": status, "detail": detail})

    # 1. Profiler
    step("profiler", "Profiler", "Reading the dataset", "running")
    profile = profile_dataframe(df)
    facts = {
        "rows": profile["rows"],
        "columns": [
            {k: c[k] for k in ("name", "kind", "missing_pct", "unique", "looks_like_id")} for c in profile["columns"][:60]
        ],
        "duplicates": profile["duplicates"],
        "target": target,
        "task": task,
        "target_stats": target_stats(df[target], task),
    }
    basic = f"{profile['rows']:,} rows and {profile['columns_count']} columns. Predicting '{target}' ({task})."
    try:
        summary = llm.text(
            "Profiler",
            "You are a careful data profiler. In 2 or 3 plain sentences describe this dataset and its biggest risks "
            "for modelling. Use only the facts given. No markdown, no lists.",
            json.dumps(facts),
        )
        step("profiler", "Profiler", "Dataset reviewed", "done", summary)
    except Exception as exc:
        step("profiler", "Profiler", "Dataset reviewed", "skipped", f"{basic} (AI summary skipped: {_reason(exc)})")

    # 2. Planner
    step("planner", "Planner", "Planning the experiment", "running")
    plan = default_plan(df, target, task)
    try:
        raw = llm.structured(
            "Planner",
            "You plan a tabular machine learning experiment. Choose which models to try and whether to log-transform "
            "the target. Only drop a feature column if it is clearly an identifier, a duplicate of the target or a "
            "leak of the answer. Never drop the target. Keep the rationale to two plain sentences.",
            json.dumps({**facts, "allowed_models": list(MODEL_KEYS)}),
            PlanOut,
        )
        plan = validate_plan(raw, df, target, task)
        step("planner", "Planner", "Plan ready", "done", plan["rationale"])
    except Exception as exc:
        step("planner", "Planner", "Plan ready", "skipped", f"{plan['rationale']} (AI planning skipped: {_reason(exc)})")

    # 3 and 4. Cleaner and Modeler run inside run_experiment and report through emit
    result = run_experiment(df, target, task, progress, plan=plan, emit=emit, tune_budget=tune_budget, artifact_dir=artifact_dir)
    result["plan"] = plan
    result["ai"] = llm.info()

    # 5. Advisor
    step("advisor", "Advisor", "Explaining the result", "running")
    rec = result["recommendation"]
    try:
        top = [
            {"model": m["name"], "cv_mean": round(m["cv_mean"], 3), "cv_std": round(m["cv_std"], 3), "test": {k: round(v, 3) for k, v in m["test"].items()}, "seconds": m["seconds"]}
            for m in result["models"]
        ]
        text = llm.text(
            "Advisor",
            "You explain machine learning results to a non-expert. Write 3 or 4 plain sentences about why the "
            "recommended model was chosen and what the user should watch out for. Use ONLY the numbers provided. "
            "Do not invent numbers. If verdict is no_signal, say clearly that no model should be trusted. If the review has "
            "findings, mention the most important one. No markdown.",
            json.dumps({"metric": result["primary_metric"], "recommendation": rec, "models": top, "warnings": result["warnings"], "plan": plan["rationale"], "review": result["review"]}),
        )
        rec["explanation"] = text
        step("advisor", "Advisor", "Result explained", "done", text)
    except Exception as exc:
        step("advisor", "Advisor", "Result explained", "skipped", f"Used the rule-based explanation. ({_reason(exc)})")

    if artifact_dir:
        try:
            artifact_dir.mkdir(parents=True, exist_ok=True)
            (artifact_dir / "report.md").write_text(artifacts.build_report(result), encoding="utf-8")
            result["artifacts"]["report"] = True
        except Exception:
            result["warnings"].append("The report file could not be saved.")
    return result
