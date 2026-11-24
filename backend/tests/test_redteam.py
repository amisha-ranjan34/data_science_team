import numpy as np
import pandas as pd
from sklearn.ensemble import RandomForestRegressor
from sklearn.linear_model import Ridge
from sklearn.pipeline import Pipeline

from app.modeling import run_experiment
from app.pipeline import build_preprocessor
from app.redteam import THRESHOLDS, grade, run_redteam
from tests.test_phase3 import noisy_classification, noisy_regression


def fit(df, target, numeric, categorical=(), model=None):
    X, y = df[numeric + list(categorical)], df[target]
    n = int(len(df) * 0.75)
    pipe = Pipeline([("prep", build_preprocessor(numeric, list(categorical))), ("model", model if model is not None else Ridge())]).fit(X[:n], y[:n])
    return pipe, X[:n], y[:n], X[n:], y[n:]


def attack(result, name):
    return next((a for a in result["attacks"] if a["name"] == name), None)


def test_grading_uses_the_share_of_skill_lost():
    medium, high = THRESHOLDS["missing"]
    assert grade(0.10, medium, high) == "pass" and grade(0.30, medium, high) == "medium" and grade(0.60, medium, high) == "high"
    assert grade(0.12, *THRESHOLDS["noise"]) == "medium"  # noise is judged more strictly than missing data


def test_a_model_that_needs_one_column_is_flagged_for_dependence():
    rng = np.random.default_rng(0)
    df = pd.DataFrame({"a": rng.normal(size=600), "b": rng.normal(size=600)})
    df["y"] = df["a"] * 5 + rng.normal(0, 0.1, 600)
    pipe, Xtr, ytr, Xte, yte = fit(df, "y", ["a", "b"])
    out = run_redteam(pipe, Xtr, ytr, Xte, yte, "regression", ["a", "b"], [], "R²")
    assert attack(out, "Single-column dependence")["severity"] == "medium"
    assert attack(out, "Missing values")["severity"] == "pass"  # losing 20% of one column costs about 15% of the skill
    assert attack(out, "Unseen categories") is None  # no categorical columns, so that attack is skipped
    assert out["verdict"] == "caution"


def test_weak_subgroup_is_found():
    rng = np.random.default_rng(1)
    n = 2000
    g = rng.choice(["x", "y", "z"], n, p=[0.45, 0.45, 0.10])
    a = rng.normal(size=n)
    df = pd.DataFrame({"a": a, "g": g})
    df["y"] = np.where(g == "z", -4 * a, 4 * a) + rng.normal(0, 0.3, n)  # a model that cannot see g gets z backwards
    pipe, Xtr, ytr, Xte, yte = fit(df, "y", ["a"])
    Xte = Xte.assign(g=df.loc[Xte.index, "g"])  # the group column is only used for slicing, not by the model
    out = run_redteam(pipe, Xtr, ytr, Xte, yte, "regression", ["a"], ["g"], "R²")
    sub = attack(out, "Weak subgroups")
    assert sub["severity"] in {"medium", "high"} and "g = z" in sub["result"]


def test_redundant_features_soften_the_damage():
    rng = np.random.default_rng(2)
    a = rng.normal(size=800)
    df = pd.DataFrame({"a": a, "b": a + rng.normal(0, 0.05, 800), "c": a + rng.normal(0, 0.05, 800)})
    df["y"] = 3 * a + rng.normal(0, 0.2, 800)
    pipe, Xtr, ytr, Xte, yte = fit(df, "y", ["a", "b", "c"])
    out = run_redteam(pipe, Xtr, ytr, Xte, yte, "regression", ["a", "b", "c"], [], "R²")
    assert attack(out, "Noisy inputs")["severity"] == "pass"
    assert attack(out, "Missing values")["severity"] != "high"
    assert attack(out, "Single-column dependence")["severity"] == "pass"
    assert out["verdict"] in {"pass", "caution"}


def test_a_model_with_no_skill_gets_a_skill_check_instead_of_meaningless_percentages():
    rng = np.random.default_rng(3)
    df = pd.DataFrame(rng.normal(size=(300, 3)), columns=list("abc"))
    df["y"] = rng.normal(size=300)
    pipe, Xtr, ytr, Xte, yte = fit(df, "y", list("abc"))
    out = run_redteam(pipe, Xtr, ytr, Xte, yte, "regression", list("abc"), [], "R²")
    assert [a["name"] for a in out["attacks"]] == ["Skill check"] and out["verdict"] == "caution"


def test_attacks_report_how_much_skill_was_lost():
    df = noisy_regression()
    pipe, Xtr, ytr, Xte, yte = fit(df, "target", list("abcde"), ["city"], RandomForestRegressor(100, random_state=0))
    out = run_redteam(pipe, Xtr, ytr, Xte, yte, "regression", list("abcde"), ["city"], "R²")
    assert len(out["attacks"]) == 5
    assert "of the skill it has over guessing" in attack(out, "Missing values")["result"]


def test_experiment_includes_redteam_for_regression_and_classification():
    reg = run_experiment(noisy_regression(), "target", "regression")
    assert reg["redteam"] and {a["name"] for a in reg["redteam"]["attacks"]} >= {"Noisy inputs", "Missing values", "Weak subgroups"}
    clf = run_experiment(noisy_classification(), "label", "classification")
    assert clf["redteam"]["metric"] == "Macro F1"
    assert any(a["name"] == "Single-column dependence" for a in clf["redteam"]["attacks"])


def test_no_redteam_when_nothing_beats_baseline():
    rng = np.random.default_rng(1)
    df = pd.DataFrame(rng.normal(size=(300, 4)), columns=list("abcd"))
    df["target"] = rng.normal(size=300)
    assert run_experiment(df, "target", "regression")["redteam"] is None
