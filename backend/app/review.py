"""The Reviewer: code-based checks that try to catch a result that looks better than it should."""
from __future__ import annotations

import pandas as pd
from sklearn.model_selection import cross_val_score
from sklearn.pipeline import Pipeline
from sklearn.tree import DecisionTreeClassifier, DecisionTreeRegressor

from .pipeline import build_preprocessor

CHECKS = [
    "Single-column leakage probe",
    "Train versus test gap",
    "Score plausibility",
    "Class balance",
    "Test set size",
    "Fold stability",
]
ORDER = {"high": 0, "medium": 1, "info": 2}


def single_feature_probe(X: pd.DataFrame, y: pd.Series, task: str, numeric: list[str], categorical: list[str], scoring: str, limit: int = 40):
    """Score each column on its own with a tiny tree. A column that alone predicts the target is suspicious."""
    if len(X) > 3000:
        X = X.sample(3000, random_state=0)
        y = y.loc[X.index]
    scores = []
    for col in (numeric + categorical)[:limit]:
        prep = build_preprocessor([col] if col in numeric else [], [col] if col in categorical else [])
        tree = DecisionTreeRegressor(max_depth=4, random_state=0) if task == "regression" else DecisionTreeClassifier(max_depth=4, random_state=0)
        try:
            s = float(cross_val_score(Pipeline([("prep", prep), ("tree", tree)]), X[[col]], y, cv=3, scoring=scoring).mean())
        except Exception:
            continue
        scores.append((col, s))
    return sorted(scores, key=lambda t: -t[1])[:3]


def build_review(task: str, label: str, models: list[dict], rec: dict, n_test: int, probe: list, majority_share: float | None) -> dict:
    findings: list[dict] = []
    real = [m for m in models if m["complexity"] > 0]
    subject = next((m for m in models if m["name"] == rec.get("model")), None) or (max(real, key=lambda m: m["cv_mean"]) if real else models[0])
    test_key = "r2" if task == "regression" else "f1_macro"

    def add(severity: str, title: str, detail: str) -> None:
        findings.append({"severity": severity, "title": title, "detail": detail})

    for col, score in probe:
        if score >= 0.95:
            add("high", f"'{col}' alone predicts the target", f"A tiny tree using only '{col}' reaches {label} {score:.2f}. This usually means the column leaks the answer, for example it is calculated from the target. Check it before trusting any model.")
        elif score >= 0.8:
            add("medium", f"'{col}' is a very strong single predictor", f"On its own it reaches {label} {score:.2f}. This can be real, but confirm it would be known at prediction time.")

    gap = subject["cv_mean"] - subject["test"].get(test_key, subject["cv_mean"])
    if gap > max(0.1, 2 * subject["cv_std"]):
        add("medium", "Training scores are much higher than test scores", f"{subject['name']} scored {subject['cv_mean']:.3f} in cross-validation but {subject['test'][test_key]:.3f} on the held-out test set. It may be overfitting, so expect weaker results on new data.")

    if subject["cv_mean"] >= 0.98:
        add("high", "The score is suspiciously high", f"A {label} of {subject['cv_mean']:.3f} is rarely realistic on real data. Look for leakage or a target that is repeated in another column.")

    if majority_share is not None and majority_share >= 0.9:
        add("medium", "The classes are very imbalanced", f"{majority_share:.0%} of rows belong to one class, so accuracy can look good while the model is useless. Judge the model by {label} and look at the minority class.")

    if n_test < 100:
        add("medium", "The test set is small", f"Only {n_test} rows were held back, so the test scores can swing a lot. Treat them as rough.")

    if subject["cv_std"] > 0.1 and subject["cv_std"] > 0.2 * abs(subject["cv_mean"]):
        add("medium", "Scores change a lot between folds", f"The {label} varies by about ±{subject['cv_std']:.2f} across folds, so the model is not stable on this data.")

    findings.sort(key=lambda f: ORDER[f["severity"]])
    verdict = "fail" if any(f["severity"] == "high" for f in findings) else "caution" if findings else "pass"
    return {"verdict": verdict, "findings": findings, "checks": CHECKS}
