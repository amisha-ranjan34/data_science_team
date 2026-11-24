"""The Red Team: stress tests that try to break the recommended model before a user trusts it.

Damage is measured as the share of the model's skill that is lost, where skill means how much better than guessing
(the average for regression, the most common class for classification) the model scores on the test rows. That keeps
the verdict comparable across datasets and metrics.
"""
from __future__ import annotations

import numpy as np
import pandas as pd
from sklearn.inspection import permutation_importance
from sklearn.metrics import accuracy_score, f1_score, mean_absolute_error, r2_score

SEED = 7
MIN_SKILL = 0.05
# (medium, high): the share of skill lost. Blanking 20% of a column costs a linear model roughly 20% of that
# column's contribution, so "worse than proportional" starts at 25% and "badly broken" at 50%.
THRESHOLDS = {"noise": (0.10, 0.25), "missing": (0.25, 0.50), "unseen": (0.25, 0.50)}


def _score(task: str, y, pred) -> float:
    return float(r2_score(y, pred)) if task == "regression" else float(f1_score(y, pred, average="macro"))


def _floor(task: str, y_train, y_test) -> float:
    if task == "regression":
        return _score(task, y_test, np.full(len(y_test), float(np.mean(y_train))))
    majority = pd.Series(np.asarray(y_train)).astype(str).mode()[0]
    return _score(task, pd.Series(np.asarray(y_test)).astype(str), np.full(len(y_test), majority))


def grade(lost: float, medium: float, high: float) -> str:
    return "high" if lost >= high else "medium" if lost >= medium else "pass"


def _attack(name: str, what: str, kind: str, label: str, before: float, after: float, floor: float) -> dict:
    lost = (before - after) / (before - floor)
    sev = grade(lost, *THRESHOLDS[kind])
    if lost <= 0.005:
        outcome = "The model was not affected."
    elif lost > 1:
        outcome = f"It lost more than all of its skill and ended up worse than guessing."
    else:
        outcome = f"It lost {lost:.0%} of the skill it has over guessing."
    return {"name": name, "severity": sev, "what": what, "result": f"{label} went from {before:.3f} to {after:.3f}. {outcome}"}


def noisy_inputs(pipe, X_ref, X, y, task, numeric, label, before, floor):
    if not numeric:
        return None
    rng = np.random.default_rng(SEED)
    Xa = X.copy()
    for col in numeric:
        Xa[col] = X[col].astype(float) + rng.normal(0, 0.1 * float(X_ref[col].std() or 1.0), len(X))
    return _attack("Noisy inputs", "Added noise equal to 10% of each numeric column's spread.", "noise", label, before, _score(task, y, pipe.predict(Xa)), floor)


def missing_values(pipe, X, y, task, columns, label, before, floor):
    rng = np.random.default_rng(SEED)
    Xa = X.copy()
    for col in columns:
        Xa[col] = Xa[col].mask(rng.random(len(X)) < 0.2)
    return _attack("Missing values", "Blanked out 20% of the values in every feature column.", "missing", label, before, _score(task, y, pipe.predict(Xa)), floor)


def unseen_categories(pipe, X, y, task, categorical, label, before, floor):
    if not categorical:
        return None
    rng = np.random.default_rng(SEED)
    Xa = X.copy()
    for col in categorical:
        Xa[col] = Xa[col].mask(rng.random(len(X)) < 0.3, "__unseen__")
    return _attack("Unseen categories", "Replaced 30% of category values with a value never seen in training.", "unseen", label, before, _score(task, y, pipe.predict(Xa)), floor)


def weak_subgroups(pipe, X, y, task, numeric, categorical):
    n = len(X)
    pred = pipe.predict(X)
    y = pd.Series(np.asarray(y), index=X.index)
    groups: list[tuple[str, pd.Series]] = []
    for col in categorical[:5]:
        counts = X[col].value_counts()
        groups += [(f"{col} = {lvl}", X[col] == lvl) for lvl in counts[counts >= max(30, 0.05 * n)].index[:10]]
    for col in numeric[:5]:
        try:
            bins = pd.qcut(X[col], 4, duplicates="drop")
        except ValueError:
            continue
        groups += [(f"{col} in {iv}", bins == iv) for iv in bins.cat.categories]
    if not groups or n < 60:
        return None

    if task == "regression":
        everyone = pd.Series(True, index=X.index)

        def errors(mask):
            mae = float(mean_absolute_error(y[mask], pred[mask.to_numpy()]))
            return mae, mae / max(float(y[mask].abs().mean()), 1e-9)  # absolute error, error relative to the group's typical size

        overall_abs, overall_rel = errors(everyone)
        # A group only counts as weak when its error is high both in absolute terms and relative to its own size.
        # That avoids flagging expensive items just because their errors are bigger in money, or groups whose target sits near zero.
        scored = []
        for name, m in groups:
            if m.sum() >= 30:
                a, r = errors(m)
                scored.append((name, min(a / max(overall_abs, 1e-9), r / max(overall_rel, 1e-9)), int(m.sum())))
        worst = max(scored, key=lambda t: t[1], default=None)
        if worst is None:
            return None
        sev = "high" if worst[1] >= 2 else "medium" if worst[1] >= 1.5 else "pass"
        result = f"The worst group is {worst[0]} ({worst[2]} rows), where the error is {worst[1]:.1f} times the overall level, in absolute terms and relative to the group's own values."
    else:
        overall = float(accuracy_score(y, pred))
        scored = [(name, overall - float(accuracy_score(y[m], pred[m.to_numpy()])), int(m.sum())) for name, m in groups if m.sum() >= 30]
        worst = max(scored, key=lambda t: t[1], default=None)
        if worst is None:
            return None
        sev = "high" if worst[1] >= 0.25 else "medium" if worst[1] >= 0.12 else "pass"
        result = f"The worst group is {worst[0]} ({worst[2]} rows), where accuracy is {worst[1] * 100:.0f} points below the overall {overall:.0%}."
    return {"name": "Weak subgroups", "severity": sev, "what": "Scored the model separately on category levels and on quarters of each numeric column.", "result": result}


def column_dependence(pipe, X, y, task):
    sample = X.sample(min(len(X), 600), random_state=SEED) if len(X) > 600 else X
    ys = pd.Series(np.asarray(y), index=X.index).loc[sample.index]
    cols = list(sample.columns)[:40]
    imp = permutation_importance(pipe, sample, ys, scoring="r2" if task == "regression" else "f1_macro", n_repeats=3, random_state=SEED, n_jobs=1)
    means = {c: max(float(m), 0.0) for c, m in zip(sample.columns, imp.importances_mean) if c in cols}
    total = sum(means.values())
    if total <= 0:
        return None
    top = sorted(means.items(), key=lambda t: -t[1])[:3]
    share = top[0][1] / total
    listing = ", ".join(f"{c} ({v:.3f})" for c, v in top)
    sev = "medium" if share >= 0.8 and top[0][1] >= 0.1 else "pass"
    result = f"Shuffling one column at a time, the biggest score losses come from {listing}."
    if sev == "medium":
        result += f" The model leans almost entirely on '{top[0][0]}', so if that column is wrong or missing, the predictions will be too."
    return {"name": "Single-column dependence", "severity": sev, "what": "Shuffled each column in turn and measured how much the score fell.", "result": result}


def run_redteam(pipe, X_train, y_train, X_test, y_test, task: str, numeric: list[str], categorical: list[str], label: str) -> dict:
    """pipe must already be fitted on the training rows."""
    before = _score(task, y_test, pipe.predict(X_test))
    floor = _floor(task, y_train, y_test)
    if before - floor < MIN_SKILL:
        note = {
            "name": "Skill check",
            "severity": "medium",
            "what": "Compared the model with simply guessing the average or the most common class.",
            "result": f"On the test rows the model scores {before:.3f} against {floor:.3f} for guessing, so there is almost no skill to stress. Treat this recommendation with care.",
        }
        return {"verdict": "caution", "attacks": [note], "baseline_score": before, "metric": label}
    columns = numeric + categorical
    attacks = [
        noisy_inputs(pipe, X_train, X_test, y_test, task, numeric, label, before, floor),
        missing_values(pipe, X_test, y_test, task, columns, label, before, floor),
        unseen_categories(pipe, X_test, y_test, task, categorical, label, before, floor),
        weak_subgroups(pipe, X_test, y_test, task, numeric, categorical),
        column_dependence(pipe, X_test, y_test, task),
    ]
    attacks = [a for a in attacks if a]
    verdict = "fail" if any(a["severity"] == "high" for a in attacks) else "caution" if any(a["severity"] == "medium" for a in attacks) else "pass"
    return {"verdict": verdict, "attacks": attacks, "baseline_score": before, "metric": label}
