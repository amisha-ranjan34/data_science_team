"""Time-boxed hyperparameter search for the best model."""
from __future__ import annotations

import numpy as np
from scipy.stats import loguniform, randint
from sklearn.model_selection import KFold, RandomizedSearchCV, StratifiedKFold


def space(key: str, task: str) -> dict:
    if key == "linear":
        return {"alpha": loguniform(1e-2, 1e3)} if task == "regression" else {"C": loguniform(1e-3, 1e2)}
    if key == "random_forest":
        return {"max_depth": [None, 6, 10, 16], "min_samples_leaf": randint(1, 10), "max_features": [0.3, 0.5, 0.8, 1.0]}
    return {
        "learning_rate": loguniform(0.02, 0.3),
        "max_leaf_nodes": randint(8, 64),
        "min_samples_leaf": randint(5, 50),
        "l2_regularization": loguniform(1e-3, 2),
    }


def n_iterations(run_seconds: float, budget: float) -> int:
    """A model's timing covers about 6 fits. Tuning needs 3 fits per candidate. Returns 0 when it would be too slow."""
    per_fit = max(run_seconds / 6, 1e-3)
    n = int(budget / (per_fit * 3))
    return 0 if n < 3 else min(n, 12)


def clean(value):
    """Plain Python numbers, so results are JSON-safe and print nicely in generated code."""
    if isinstance(value, (np.integer,)):
        return int(value)
    if isinstance(value, (np.floating, float)):
        return float(f"{float(value):.6g}")
    return value


def tune_pipeline(pipe, key: str, task: str, prefix: str, X, y, scoring: str, n_iter: int, seed: int) -> dict:
    cv = StratifiedKFold(3, shuffle=True, random_state=seed) if task == "classification" else KFold(3, shuffle=True, random_state=seed)
    grid = {f"{prefix}{k}": v for k, v in space(key, task).items()}
    search = RandomizedSearchCV(pipe, grid, n_iter=n_iter, cv=cv, scoring=scoring, random_state=seed, n_jobs=1, refit=False)
    search.fit(X, y)
    return {k[len(prefix):]: clean(v) for k, v in search.best_params_.items()}
