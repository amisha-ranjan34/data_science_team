"""Train and compare candidate models, then recommend one."""
from __future__ import annotations

import time
from typing import Callable

import numpy as np
import pandas as pd
from sklearn.compose import TransformedTargetRegressor
from sklearn.dummy import DummyClassifier, DummyRegressor
from sklearn.ensemble import (
    HistGradientBoostingClassifier,
    HistGradientBoostingRegressor,
    RandomForestClassifier,
    RandomForestRegressor,
)
from sklearn.linear_model import LogisticRegression, Ridge
from sklearn.metrics import (
    accuracy_score,
    f1_score,
    mean_absolute_error,
    mean_squared_error,
    r2_score,
    roc_auc_score,
)
from sklearn.model_selection import KFold, StratifiedKFold, cross_val_score, train_test_split
from sklearn.pipeline import Pipeline

from .pipeline import build_preprocessor, choose_columns
from .profiling import MAX_ROWS

SEED = 42
PRIMARY = {"regression": "r2", "classification": "f1_macro"}
PRIMARY_LABEL = {"regression": "R²", "classification": "Macro F1"}
Progress = Callable[[float, str], None]
Emit = Callable[[dict], None]


def candidates(task: str, n_rows: int):
    """(key, name, complexity, estimator). Lower complexity means easier to explain."""
    trees = 50 if n_rows < 1000 else (100 if n_rows > 20_000 else 150)
    if task == "regression":
        return [
            ("baseline", "Baseline (predicts the mean)", 0, DummyRegressor(strategy="mean")),
            ("linear", "Ridge regression", 1, Ridge(alpha=1.0)),
            ("random_forest", "Random forest", 2, RandomForestRegressor(n_estimators=trees, random_state=SEED)),
            ("gradient_boosting", "Gradient boosting", 2, HistGradientBoostingRegressor(random_state=SEED)),
        ]
    return [
        ("baseline", "Baseline (predicts the majority class)", 0, DummyClassifier(strategy="most_frequent")),
        ("linear", "Logistic regression", 1, LogisticRegression(max_iter=1000)),
        ("random_forest", "Random forest", 2, RandomForestClassifier(n_estimators=trees, random_state=SEED)),
        ("gradient_boosting", "Gradient boosting", 2, HistGradientBoostingClassifier(random_state=SEED)),
    ]


def test_metrics(task: str, pipe: Pipeline, X_test: pd.DataFrame, y_test: pd.Series) -> dict:
    pred = pipe.predict(X_test)
    if task == "regression":
        return {
            "r2": float(r2_score(y_test, pred)),
            "rmse": float(mean_squared_error(y_test, pred) ** 0.5),
            "mae": float(mean_absolute_error(y_test, pred)),
        }
    out = {
        "accuracy": float(accuracy_score(y_test, pred)),
        "f1_macro": float(f1_score(y_test, pred, average="macro")),
    }
    try:
        proba = pipe.predict_proba(X_test)
        classes = pipe.classes_
        if proba.shape[1] == 2:
            out["roc_auc"] = float(roc_auc_score((y_test == classes[1]).astype(int), proba[:, 1]))
        else:
            out["roc_auc"] = float(roc_auc_score(y_test, proba, multi_class="ovr", labels=classes))
    except Exception:
        pass
    return out


def leakage_suspects(X: pd.DataFrame, y: pd.Series, task: str) -> list[str]:
    if task != "regression":
        return []
    notes = []
    for col in X.select_dtypes("number").columns:
        corr = X[col].corr(y)
        if pd.notna(corr) and abs(corr) > 0.98:
            notes.append(f"'{col}' is almost perfectly correlated with the target ({corr:.2f}). Check for data leakage.")
    return notes


def recommend(models: list[dict], task: str) -> dict:
    label = PRIMARY_LABEL[task]
    base = next(m for m in models if m["complexity"] == 0)
    real = sorted((m for m in models if m["complexity"] > 0), key=lambda m: m["cv_mean"], reverse=True)
    best = real[0]
    if best["cv_mean"] <= base["cv_mean"] + base["cv_std"]:
        return {
            "model": None,
            "verdict": "no_signal",
            "reason": (
                "No model beat the baseline by more than one standard deviation. "
                "The features may not carry enough signal for this target, so I would not trust any of these models."
            ),
        }
    threshold = best["cv_mean"] - best["cv_std"]
    pick = min((m for m in real if m["cv_mean"] >= threshold), key=lambda m: (m["complexity"], m["seconds"]))
    if pick is best:
        reason = (
            f"{best['name']} had the highest cross-validated {label} "
            f"({best['cv_mean']:.3f} ± {best['cv_std']:.3f}) and clearly beats the baseline "
            f"({base['cv_mean']:.3f})."
        )
    else:
        reason = (
            f"{pick['name']} scored {pick['cv_mean']:.3f} ± {pick['cv_std']:.3f}, within one standard deviation of "
            f"{best['name']} ({best['cv_mean']:.3f})."
        )
        if pick["complexity"] < best["complexity"]:
            reason += " It is a simpler model, so it is easier to explain and safer to trust."
        else:
            reason += f" It trained faster ({pick['seconds']}s vs {best['seconds']}s), so it is cheaper to run."
    return {"model": pick["name"], "verdict": "ok", "reason": reason}


def run_experiment(
    df: pd.DataFrame,
    target: str,
    task: str,
    progress: Progress | None = None,
    plan: dict | None = None,
    emit: Emit | None = None,
) -> dict:
    progress = progress or (lambda f, m: None)
    emit = emit or (lambda e: None)
    plan = plan or {}
    if target not in df.columns:
        raise ValueError(f"Column '{target}' was not found in the file.")
    df = df.dropna(subset=[target]).reset_index(drop=True)
    warnings: list[str] = []
    before = len(df)
    df = df.drop_duplicates().reset_index(drop=True)
    if len(df) < before:
        warnings.append(
            f"Removed {before - len(df)} exact duplicate rows before splitting, "
            "so copies of the same row cannot appear in both train and test."
        )
    if len(df) > MAX_ROWS:
        df = df.sample(MAX_ROWS, random_state=SEED).reset_index(drop=True)

    y = df[target]
    X = df.drop(columns=[target])
    if task == "classification":
        y = y.astype(str)
        counts = y.value_counts()
        if len(counts) < 2:
            raise ValueError("The target has only one class, so there is nothing to predict.")
        if counts.min() < 2:
            raise ValueError("Some target classes appear only once. Remove or merge them and try again.")
    else:
        y = pd.to_numeric(y, errors="coerce")
        if y.isna().any():
            raise ValueError("The target has non-numeric values, so it cannot be used for regression.")

    progress(0.05, "Checking columns")
    emit({"id": "cleaner", "agent": "Cleaner", "title": "Cleaning the data", "status": "running", "detail": ""})
    numeric, categorical, dropped = choose_columns(X)
    for d in plan.get("drop_columns", []):
        if d["column"] in numeric:
            numeric.remove(d["column"])
        elif d["column"] in categorical:
            categorical.remove(d["column"])
        else:
            continue
        dropped.append({"column": d["column"], "reason": f"Dropped by the Planner: {d['reason']}"})
    if not (numeric or categorical):
        raise ValueError("No usable feature columns are left after removing IDs and constant columns.")
    X = X[numeric + categorical]
    warnings += leakage_suspects(X, y, task)
    clean_bits = [w for w in warnings if w.startswith("Removed")]
    clean_bits.append(f"{len(numeric) + len(categorical)} feature columns kept")
    if dropped:
        clean_bits.append("left out: " + ", ".join(d["column"] for d in dropped))
    emit({"id": "cleaner", "agent": "Cleaner", "title": "Data cleaned", "status": "done", "detail": ". ".join(clean_bits) + "."})

    progress(0.10, "Splitting into train and test sets")
    stratify = y if task == "classification" else None
    X_train, X_test, y_train, y_test = train_test_split(
        X, y, test_size=0.2, random_state=SEED, stratify=stratify
    )
    if task == "classification":
        folds = min(5, int(y_train.value_counts().min()))
        if folds < 2:
            raise ValueError("Not enough rows in the smallest class to cross-validate.")
        cv = StratifiedKFold(n_splits=folds, shuffle=True, random_state=SEED)
    else:
        cv = KFold(n_splits=5, shuffle=True, random_state=SEED)

    allowed = set(plan.get("models") or ["linear", "random_forest", "gradient_boosting"]) | {"baseline"}
    cands = [c for c in candidates(task, len(X_train)) if c[0] in allowed]
    use_log = task == "regression" and plan.get("target_transform") == "log"
    models = []
    for i, (key, name, complexity, est) in enumerate(cands):
        progress(0.15 + 0.8 * i / len(cands), f"Training {name}")
        sid = f"model:{key}"
        emit({"id": sid, "agent": "Modeler", "title": f"Training {name}", "status": "running", "detail": ""})
        if use_log and complexity > 0:  # the baseline stays on the original scale so the comparison is honest
            est = TransformedTargetRegressor(regressor=est, func=np.log1p, inverse_func=np.expm1, check_inverse=False)
        pipe = Pipeline([("prep", build_preprocessor(numeric, categorical)), ("model", est)])
        t0 = time.perf_counter()
        scores = cross_val_score(pipe, X_train, y_train, cv=cv, scoring=PRIMARY[task])
        pipe.fit(X_train, y_train)
        elapsed = time.perf_counter() - t0
        models.append(
            {
                "name": name,
                "complexity": complexity,
                "cv_mean": float(np.mean(scores)),
                "cv_std": float(np.std(scores)),
                "test": test_metrics(task, pipe, X_test, y_test),
                "seconds": round(elapsed, 2),
            }
        )
        emit(
            {
                "id": sid,
                "agent": "Modeler",
                "title": f"Trained {name}",
                "status": "done",
                "detail": f"{PRIMARY_LABEL[task]} {models[-1]['cv_mean']:.3f} ± {models[-1]['cv_std']:.3f} in {models[-1]['seconds']}s",
            }
        )
    models.sort(key=lambda m: m["cv_mean"], reverse=True)
    for rank, m in enumerate(models, start=1):
        m["rank"] = rank
    progress(1.0, "Done")
    return {
        "task": task,
        "target": target,
        "primary_metric": PRIMARY_LABEL[task],
        "n_rows": len(df),
        "n_features": len(numeric) + len(categorical),
        "split": {"train": len(X_train), "test": len(X_test), "cv_folds": cv.get_n_splits()},
        "dropped_columns": dropped,
        "warnings": warnings,
        "models": models,
        "recommendation": recommend(models, task),
    }
