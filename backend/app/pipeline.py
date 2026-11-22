"""Leak-safe preprocessing: every step is fitted on training data only, inside a sklearn Pipeline."""
from __future__ import annotations

import pandas as pd
from sklearn.compose import ColumnTransformer
from sklearn.impute import SimpleImputer
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import OneHotEncoder, StandardScaler

from .profiling import column_kind


def choose_columns(X: pd.DataFrame):
    """Decide which columns to keep. Returns (numeric, categorical, dropped)."""
    numeric, categorical, dropped = [], [], []
    n = len(X)
    for col in X.columns:
        s = X[col]
        unique = s.nunique(dropna=True)
        if unique <= 1:
            dropped.append({"column": col, "reason": "Constant: every row has the same value."})
        elif s.isna().mean() > 0.6:
            dropped.append({"column": col, "reason": "More than 60% of values are missing."})
        elif unique / max(n, 1) > 0.95 and not pd.api.types.is_float_dtype(s):
            dropped.append({"column": col, "reason": "Looks like an ID: almost every value is unique."})
        elif column_kind(s) == "categorical":
            if unique > 50 and unique / max(n, 1) > 0.5:
                dropped.append({"column": col, "reason": "Free text or very high-cardinality category."})
            else:
                categorical.append(col)
        else:
            numeric.append(col)
    return numeric, categorical, dropped


def build_preprocessor(numeric: list[str], categorical: list[str]) -> ColumnTransformer:
    transformers = []
    if numeric:
        transformers.append(
            ("num", Pipeline([("impute", SimpleImputer(strategy="median")), ("scale", StandardScaler())]), numeric)
        )
    if categorical:
        transformers.append(
            (
                "cat",
                Pipeline(
                    [
                        ("impute", SimpleImputer(strategy="most_frequent")),
                        (
                            "onehot",
                            OneHotEncoder(handle_unknown="infrequent_if_exist", max_categories=30, sparse_output=False),
                        ),
                    ]
                ),
                categorical,
            )
        )
    return ColumnTransformer(transformers, remainder="drop")
