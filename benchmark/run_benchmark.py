"""Benchmark: Auto Data Science Team against FLAML (an established AutoML library) and a default gradient boosting model.

Run from the repository root:
    pip install -r benchmark/requirements.txt
    python benchmark/run_benchmark.py --seeds 5 --budget 8 --max-rows 3000

Protocol (identical for every method):
  * each dataset is de-duplicated, then split 75/25 with a fixed seed; every method sees only the 75% to learn from
  * regression is scored with R2, classification with macro F1, on the untouched 25%
  * FLAML gets as much wall-clock time as our system used (at least 10s, at most 60s)
  * our system runs in offline mode (no LLM), so the numbers do not depend on any AI provider
"""
from __future__ import annotations

import argparse
import json
import os
import sys
import tempfile
import time
import urllib.request
import warnings
from pathlib import Path

os.environ.setdefault("LOKY_MAX_CPU_COUNT", "2")

import joblib
import numpy as np
import pandas as pd
from sklearn.dummy import DummyClassifier, DummyRegressor
from sklearn.ensemble import HistGradientBoostingClassifier, HistGradientBoostingRegressor
from sklearn.metrics import accuracy_score, f1_score, r2_score
from sklearn.model_selection import train_test_split
from sklearn.pipeline import Pipeline

warnings.filterwarnings("ignore")
ROOT = Path(__file__).resolve().parent
sys.path.insert(0, str(ROOT.parent / "backend"))
for key in ("GROQ_API_KEY", "GOOGLE_API_KEY", "GEMINI_API_KEY", "OPENAI_API_KEY", "ANTHROPIC_API_KEY", "LLM_PROVIDER"):
    os.environ.pop(key, None)

from app import llm as llm_mod  # noqa: E402
from app.pipeline import build_preprocessor, choose_columns  # noqa: E402
from app.team import run_team  # noqa: E402


class OfflineLLM:  # the benchmark must not depend on an AI provider
    enabled = False

    def info(self):
        return {"enabled": False, "provider": None, "model": None, "hint": "benchmark"}

    def text(self, *a, **k):
        raise llm_mod.LLMUnavailable("benchmark runs offline")

    structured = text


llm_mod._llm = OfflineLLM()

SEABORN = "https://raw.githubusercontent.com/mwaskom/seaborn-data/master/{}.csv"
CAR = "https://raw.githubusercontent.com/campusx-official/agno-building-ai-agents/main/agno-data-science-team/data/car_details.csv"
DATA_DIR = ROOT / "data"


def csv(url: str, name: str) -> pd.DataFrame:
    DATA_DIR.mkdir(exist_ok=True)
    path = DATA_DIR / f"{name}.csv"
    if not path.exists():
        req = urllib.request.Request(url, headers={"User-Agent": "auto-ds-team-benchmark"})
        path.write_bytes(urllib.request.urlopen(req, timeout=60).read())
    return pd.read_csv(path)


def sk(loader):
    from sklearn import datasets

    return getattr(datasets, loader)(as_frame=True).frame


# name, task, target, loader, columns to drop, note
DATASETS = [
    ("diabetes", "regression", "target", lambda: sk("load_diabetes"), [], "sklearn, 442 rows"),
    ("car_details", "regression", "selling_price", lambda: csv(CAR, "car_details"), [], "used cars, many duplicate rows"),
    ("mpg", "regression", "mpg", lambda: csv(SEABORN.format("mpg"), "mpg"), [], "fuel economy, has a free-text name column"),
    ("tips", "regression", "tip", lambda: csv(SEABORN.format("tips"), "tips"), [], "restaurant tips, 244 rows"),
    ("diamonds", "regression", "price", lambda: csv(SEABORN.format("diamonds"), "diamonds"), [], "sampled to the row cap"),
    ("healthexp", "regression", "Life_Expectancy", lambda: csv(SEABORN.format("healthexp"), "healthexp"), [], "health spending by country"),
    ("breast_cancer", "classification", "target", lambda: sk("load_breast_cancer"), [], "sklearn, 30 numeric features"),
    ("wine", "classification", "target", lambda: sk("load_wine"), [], "sklearn, 178 rows, 3 classes"),
    ("digits", "classification", "target", lambda: sk("load_digits"), [], "sklearn, 64 pixels, 10 classes"),
    ("titanic", "classification", "survived", lambda: csv(SEABORN.format("titanic"), "titanic"), ["alive"], "'alive' dropped: it repeats the target"),
    ("penguins", "classification", "species", lambda: csv(SEABORN.format("penguins"), "penguins"), [], "3 species, has missing values"),
    ("taxis", "classification", "payment", lambda: csv(SEABORN.format("taxis"), "taxis"), ["tip", "total", "pickup", "dropoff"], "'tip' and 'total' dropped (cash tips are not recorded); raw timestamps dropped"),
    ("car_crashes", "regression", "total", lambda: csv(SEABORN.format("car_crashes"), "car_crashes"), [], "state road-safety observations"),
    ("iris", "classification", "species", lambda: csv(SEABORN.format("iris"), "iris"), [], "classic 3-species classification dataset"),
    ("geyser", "regression", "waiting", lambda: csv(SEABORN.format("geyser"), "geyser"), [], "Old Faithful eruption and waiting times"),
    ("exercise", "regression", "pulse", lambda: csv(SEABORN.format("exercise"), "exercise"), ["id", "Unnamed: 0"], "repeated measurements; row index and subject IDs excluded"),
]


def prepare(df: pd.DataFrame, target: str, drop: list[str], max_rows: int) -> pd.DataFrame:
    df = df.drop(columns=[c for c in drop if c in df.columns]).dropna(subset=[target]).drop_duplicates().reset_index(drop=True)
    return df.sample(max_rows, random_state=0).reset_index(drop=True) if len(df) > max_rows else df


def score(task: str, y_true, pred) -> dict:
    if task == "regression":
        return {"score": float(r2_score(y_true, pred))}
    yt, yp = pd.Series(y_true).astype(str), pd.Series(np.asarray(pred)).astype(str)
    return {"score": float(f1_score(yt, yp, average="macro")), "accuracy": float(accuracy_score(yt, yp))}


def baseline_predictions(task: str, y_train, n: int):
    if task == "regression":
        return np.full(n, float(np.mean(y_train)))
    return np.full(n, pd.Series(y_train).astype(str).mode()[0])


def run_ours(train, test, target, task, tune_budget):
    with tempfile.TemporaryDirectory() as tmp:
        t0 = time.perf_counter()
        res = run_team(train, target, task, lambda e: None, lambda f, m: None, artifact_dir=Path(tmp), tune_budget=tune_budget)
        seconds = time.perf_counter() - t0
        rec = res["recommendation"]
        if rec["verdict"] == "ok":
            bundle = joblib.load(Path(tmp) / "model.joblib")
            pred = bundle["pipeline"].predict(test[bundle["features"]])
        else:  # nothing beat the baseline, so the honest answer is the baseline itself
            pred = baseline_predictions(task, train[target], len(test))
    out = score(task, test[target], pred)
    out.update(seconds=round(seconds, 1), model=rec.get("model") or "none (baseline)", review=res["review"]["verdict"], redteam=(res["redteam"] or {}).get("verdict"))
    return out


def run_flaml(train, test, target, task, budget):
    try:
        from flaml import AutoML
    except Exception as exc:  # not installed or blocked by the machine
        return {"skipped": f"FLAML unavailable ({exc.__class__.__name__})"}
    x_train = train.drop(columns=[target]).copy()
    x_test = test.drop(columns=[target]).copy()
    safe_names = [f"feature_{index}" for index in range(len(x_train.columns))]
    x_train.columns = safe_names
    x_test.columns = safe_names
    t0 = time.perf_counter()
    automl = AutoML()
    automl.fit(
        X_train=x_train,
        y_train=train[target],
        task=task,
        metric="r2" if task == "regression" else "macro_f1",
        time_budget=budget,
        seed=0,
        verbose=0,
    )
    pred = automl.predict(x_test)
    out = score(task, test[target], pred)
    out.update(seconds=round(time.perf_counter() - t0, 1), model=str(automl.best_estimator))
    return out


def run_default_gbm(train, test, target, task):
    X, y = train.drop(columns=[target]), train[target]
    numeric, categorical, _ = choose_columns(X)
    est = HistGradientBoostingRegressor(random_state=0) if task == "regression" else HistGradientBoostingClassifier(random_state=0)
    pipe = Pipeline([("prep", build_preprocessor(numeric, categorical)), ("model", est)])
    t0 = time.perf_counter()
    pipe.fit(X[numeric + categorical], y.astype(str) if task == "classification" else y)
    out = score(task, test[target], pipe.predict(test[numeric + categorical]))
    out.update(seconds=round(time.perf_counter() - t0, 1))
    return out


def run_baseline(train, test, target, task):
    return score(task, test[target], baseline_predictions(task, train[target], len(test)))


def split(df, target, task, seed):
    stratify = df[target] if task == "classification" and df[target].value_counts().min() >= 2 else None
    return train_test_split(df, test_size=0.25, random_state=seed, stratify=stratify)


def leak_demo(max_rows: int) -> dict:
    """Titanic with the leaking 'alive' column left in. The Reviewer should refuse to bless the result."""
    df = prepare(csv(SEABORN.format("titanic"), "titanic"), "survived", [], max_rows)
    tr, te = split(df, "survived", "classification", 0)
    out = run_ours(tr, te, "survived", "classification", 0)
    with tempfile.TemporaryDirectory() as tmp:
        res = run_team(tr, "survived", "classification", lambda e: None, lambda f, m: None, artifact_dir=Path(tmp), tune_budget=0)
    out["findings"] = [f["title"] for f in res["review"]["findings"]]
    return out


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--seeds", type=int, default=5)
    ap.add_argument("--budget", type=float, default=8, help="tuning budget (seconds) for our system")
    ap.add_argument("--max-rows", type=int, default=3000)
    ap.add_argument("--only", default="", help="comma-separated dataset names")
    ap.add_argument("--out", default=str(ROOT / "results.json"))
    args = ap.parse_args()

    out_path = Path(args.out)
    state = json.loads(out_path.read_text()) if out_path.exists() else {"rows": [], "leak_demo": None, "config": {}}
    state["config"] = {"seeds": args.seeds, "tuning_budget": args.budget, "max_rows": args.max_rows}
    done = {(r["dataset"], r["seed"]) for r in state["rows"]}
    wanted = set(filter(None, args.only.split(",")))

    for name, task, target, loader, drop, note in DATASETS:
        if wanted and name not in wanted:
            continue
        df = prepare(loader(), target, drop, args.max_rows)
        for seed in range(args.seeds):
            if (name, seed) in done:
                continue
            train, test = split(df, target, task, seed)
            ours = run_ours(train, test, target, task, args.budget)
            flaml_budget = float(min(60, max(10, ours["seconds"])))
            methods = {"ours": ours, "flaml": run_flaml(train, test, target, task, flaml_budget), "default_gbm": run_default_gbm(train, test, target, task), "baseline": run_baseline(train, test, target, task)}
            state["rows"].append({"dataset": name, "task": task, "seed": seed, "n_train": len(train), "n_test": len(test), "note": note, "methods": methods})
            out_path.write_text(json.dumps(state, indent=1))
            line = " | ".join(f"{m} {v['score']:.3f}" if "score" in v else f"{m} skipped" for m, v in methods.items())
            print(f"[{name} seed {seed}] {line} (ours {ours['seconds']}s: {ours['model']})", flush=True)

    if not wanted and state["leak_demo"] is None:
        state["leak_demo"] = leak_demo(args.max_rows)
        out_path.write_text(json.dumps(state, indent=1))
        print("[leak demo] review:", state["leak_demo"]["review"], "|", state["leak_demo"]["findings"], flush=True)

    from summarize import write_markdown  # noqa: E402

    write_markdown(state, ROOT / "RESULTS.md")
    print(f"Wrote {ROOT / 'RESULTS.md'}")


if __name__ == "__main__":
    main()
