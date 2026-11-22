"""Read a CSV and describe it: column types, missing values, suggested target and task."""
from __future__ import annotations

import numpy as np
import pandas as pd

MAX_ROWS = 50_000
TARGET_HINTS = ("target", "label", "class", "price", "outcome", "churn", "survived", "salary", "sales", "y")


def load_csv(path: str) -> pd.DataFrame:
    df = None
    for enc in ("utf-8", "utf-8-sig", "latin-1"):
        try:
            df = pd.read_csv(path, sep=None, engine="python", encoding=enc)
            break
        except UnicodeDecodeError:
            continue
        except Exception as exc:  # malformed file
            raise ValueError(f"This file could not be read as a CSV ({exc.__class__.__name__}).") from exc
    if df is None:
        raise ValueError("This file could not be decoded. Save it as a UTF-8 CSV and upload it again.")
    df.columns = [str(c).strip() for c in df.columns]
    df = df.dropna(how="all").dropna(axis=1, how="all").reset_index(drop=True)
    if df.shape[1] < 2:
        raise ValueError("The file needs at least two columns: one to predict and one or more features.")
    if len(df) < 20:
        raise ValueError("The file needs at least 20 rows to train and compare models.")
    return df


def column_kind(s: pd.Series) -> str:
    if pd.api.types.is_bool_dtype(s):
        return "categorical"
    if pd.api.types.is_numeric_dtype(s):
        return "numeric"
    return "categorical"


def infer_task(y: pd.Series) -> str:
    y = y.dropna()
    if column_kind(y) == "categorical":
        return "classification"
    n_unique = y.nunique()
    if n_unique <= 10 and n_unique / max(len(y), 1) < 0.05:
        return "classification"
    return "regression"


def suggest_target(df: pd.DataFrame) -> str:
    lowered = {c.lower(): c for c in df.columns}
    for hint in TARGET_HINTS:
        if hint in lowered:
            return lowered[hint]
    for col in df.columns:
        if any(h in col.lower() for h in TARGET_HINTS if len(h) > 2):
            return col
    return df.columns[-1]


def profile_dataframe(df: pd.DataFrame) -> dict:
    n = len(df)
    columns = []
    warnings: list[str] = []
    for col in df.columns:
        s = df[col]
        unique = int(s.nunique(dropna=True))
        missing_pct = round(float(s.isna().mean()) * 100, 1)
        is_id = unique / max(n, 1) > 0.95 and not pd.api.types.is_float_dtype(s)
        columns.append(
            {
                "name": col,
                "kind": column_kind(s),
                "missing_pct": missing_pct,
                "unique": unique,
                "sample": [str(v) for v in s.dropna().unique()[:3]],
                "looks_like_id": bool(is_id),
            }
        )
        if missing_pct > 40:
            warnings.append(f"'{col}' is {missing_pct}% empty and may be dropped.")
    dupes = int(df.duplicated().sum())
    if dupes:
        warnings.append(f"{dupes} duplicate rows found. They will be removed before the train/test split.")
    if n < 200:
        warnings.append("Small dataset. Cross-validation scores will vary a lot between folds.")
    if n > MAX_ROWS:
        warnings.append(f"Large dataset. A random sample of {MAX_ROWS:,} rows will be used for training.")
    target = suggest_target(df)
    return {
        "rows": n,
        "columns_count": df.shape[1],
        "duplicates": dupes,
        "columns": columns,
        "suggested_target": target,
        "suggested_task": infer_task(df[target]),
        "warnings": warnings,
    }
