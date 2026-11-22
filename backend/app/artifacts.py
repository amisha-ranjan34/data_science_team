"""Files the user can download: the trained model, a reproducible script and a short report."""
from __future__ import annotations

from pathlib import Path

import joblib
from sklearn.base import clone

IMPORTS = {
    "Ridge": "from sklearn.linear_model import Ridge",
    "LogisticRegression": "from sklearn.linear_model import LogisticRegression",
    "RandomForestRegressor": "from sklearn.ensemble import RandomForestRegressor",
    "RandomForestClassifier": "from sklearn.ensemble import RandomForestClassifier",
    "HistGradientBoostingRegressor": "from sklearn.ensemble import HistGradientBoostingRegressor",
    "HistGradientBoostingClassifier": "from sklearn.ensemble import HistGradientBoostingClassifier",
}


def save_model(pipe_unfitted, X, y, meta: dict, path: Path) -> None:
    """Refit on every cleaned row, since the held-out test already did its job, and save with the column list."""
    final = clone(pipe_unfitted).fit(X, y)
    joblib.dump({"pipeline": final, **meta}, path)


def build_script(pipe_unfitted, target: str, task: str, numeric: list[str], categorical: list[str]) -> str:
    est = pipe_unfitted.named_steps["model"]
    log = hasattr(est, "regressor")
    inner = est.regressor if log else est
    cls = inner.__class__.__name__
    transformers = []
    if numeric:
        transformers.append(f'    ("num", Pipeline([("impute", SimpleImputer(strategy="median")), ("scale", StandardScaler())]), NUMERIC),')
    if categorical:
        transformers.append(
            '    ("cat", Pipeline([("impute", SimpleImputer(strategy="most_frequent")), '
            '("onehot", OneHotEncoder(handle_unknown="infrequent_if_exist", max_categories=30, sparse_output=False))]), CATEGORICAL),'
        )
    model_line = f"model = {inner!r}"
    if log:
        model_line += "\nmodel = TransformedTargetRegressor(regressor=model, func=np.log1p, inverse_func=np.expm1, check_inverse=False)"
    if task == "regression":
        y_line, stratify, metrics = "y = df[TARGET]", "None", (
            "from sklearn.metrics import mean_absolute_error, mean_squared_error, r2_score\n"
            'print("Test R2:", round(r2_score(y_test, pred), 3))\n'
            'print("Test RMSE:", round(mean_squared_error(y_test, pred) ** 0.5, 1))\n'
            'print("Test MAE:", round(mean_absolute_error(y_test, pred), 1))'
        )
    else:
        y_line, stratify, metrics = "y = df[TARGET].astype(str)", "y", (
            "from sklearn.metrics import accuracy_score, f1_score\n"
            'print("Test accuracy:", round(accuracy_score(y_test, pred), 3))\n'
            'print("Test macro F1:", round(f1_score(y_test, pred, average="macro"), 3))'
        )
    nl = "\n"
    return f'''"""Reproduces the model recommended by Auto Data Science Team.

Usage:  python train_model.py your_data.csv
Needs:  pip install pandas numpy scikit-learn joblib
"""
import sys

import joblib
import numpy as np
import pandas as pd
from sklearn.compose import ColumnTransformer, TransformedTargetRegressor
from sklearn.impute import SimpleImputer
from sklearn.model_selection import train_test_split
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import OneHotEncoder, StandardScaler
{IMPORTS[cls]}

TARGET = {target!r}
NUMERIC = {numeric!r}
CATEGORICAL = {categorical!r}

df = pd.read_csv(sys.argv[1], sep=None, engine="python")
df.columns = [str(c).strip() for c in df.columns]
df = df.dropna(subset=[TARGET]).drop_duplicates().reset_index(drop=True)
X = df[NUMERIC + CATEGORICAL]
{y_line}

preprocess = ColumnTransformer([
{nl.join(transformers)}
], remainder="drop")

{model_line}
pipe = Pipeline([("prep", preprocess), ("model", model)])

X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.2, random_state=42, stratify={stratify})
pipe.fit(X_train, y_train)
pred = pipe.predict(X_test)
{metrics}

pipe.fit(X, y)  # final model uses every row
joblib.dump({{"pipeline": pipe, "features": NUMERIC + CATEGORICAL, "target": TARGET}}, "model.joblib")
print("Saved model.joblib")
'''


def build_report(result: dict) -> str:
    rec, plan, review = result["recommendation"], result.get("plan") or {}, result.get("review") or {}
    metric = result["primary_metric"]
    lines = [f"# Model report: predicting {result['target']}", ""]
    lines += ["## Recommendation", ""]
    if rec["verdict"] == "ok":
        lines += [f"**{rec['model']}**", "", rec.get("explanation") or rec["reason"], ""]
    else:
        lines += ["**No model is recommended.**", "", rec["reason"], ""]
    lines += [
        "## Data",
        "",
        f"- {result['n_rows']:,} rows after cleaning and {result['n_features']} feature columns",
        f"- {result['split']['train']:,} rows to train, {result['split']['test']:,} held out for the final test, {result['split']['cv_folds']}-fold cross-validation",
        f"- Problem type: {result['task']}",
    ]
    for d in result["dropped_columns"]:
        lines.append(f"- Left out **{d['column']}**: {d['reason']}")
    lines += ["", "## Plan", "", plan.get("rationale", "Default plan."), ""]
    lines += ["## Models", "", f"| Rank | Model | CV {metric} | Test {metric} | Time (s) |", "|---|---|---|---|---|"]
    key = "r2" if result["task"] == "regression" else "f1_macro"
    for m in result["models"]:
        lines.append(f"| {m['rank']} | {m['name']} | {m['cv_mean']:.3f} ± {m['cv_std']:.3f} | {m['test'].get(key, float('nan')):.3f} | {m['seconds']} |")
    tuned = next((m for m in result["models"] if m.get("tuned")), None)
    if tuned:
        lines += ["", f"Tuned settings for {tuned['name']}: " + ", ".join(f"{k}={v}" for k, v in tuned["params"].items())]
    lines += ["", "## Review", ""]
    if review.get("findings"):
        for f in review["findings"]:
            lines.append(f"- **{f['severity'].upper()}: {f['title']}.** {f['detail']}")
    else:
        lines.append("All review checks passed: " + ", ".join(review.get("checks", [])) + ".")
    for w in result["warnings"]:
        lines.append(f"- Note: {w}")
    lines += [
        "",
        "## Use the model",
        "",
        "```python",
        "import joblib, pandas as pd",
        'bundle = joblib.load("model.joblib")',
        'new_data = pd.read_csv("new_rows.csv")',
        'print(bundle["pipeline"].predict(new_data[bundle["features"]]))',
        "```",
        "",
        "The saved model was refit on all cleaned rows. The scores above come from the train and test split, "
        "so treat them as an estimate for new data that looks like this file.",
    ]
    return "\n".join(lines) + "\n"
