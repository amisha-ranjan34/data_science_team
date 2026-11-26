"""Turns results.json into RESULTS.md."""
from __future__ import annotations

from collections import Counter, defaultdict

import numpy as np

METHODS = [("baseline", "Baseline"), ("default_gbm", "Default GBM"), ("flaml", "FLAML"), ("ours", "Ours")]
TIE = 0.005


def mean_scores(rows):
    table = defaultdict(lambda: defaultdict(list))
    for r in rows:
        for m, v in r["methods"].items():
            if "score" in v:
                table[(r["dataset"], r["task"])][m].append(v["score"])
    return table


def write_markdown(state: dict, path) -> None:
    rows, cfg = state["rows"], state["config"]
    table = mean_scores(rows)
    names = [(d, t) for d, t in dict.fromkeys((r["dataset"], r["task"]) for r in rows)]
    lines = ["# Benchmark results", "", f"{len(names)} public datasets, {cfg['seeds']} random splits each, one run per split. Score is R² for regression and macro F1 for classification, on rows no method saw while learning (higher is better).", ""]
    lines += ["| Dataset | Type | Baseline | Default GBM | FLAML | Ours | Ours vs FLAML |", "|---|---|---|---|---|---|---|"]
    wins = ties = losses = 0
    gaps, best_gaps = [], []
    for key in names:
        ms = {m: float(np.mean(v)) for m, v in table[key].items()}
        cells = []
        for m, _ in METHODS:
            cells.append(f"{ms[m]:.3f}" if m in ms else "n/a")
        verdict = "n/a"
        if "flaml" in ms:
            d = ms["ours"] - ms["flaml"]
            gaps.append(d)
            verdict = "win" if d > TIE else "loss" if d < -TIE else "tie"
            wins, ties, losses = wins + (verdict == "win"), ties + (verdict == "tie"), losses + (verdict == "loss")
            verdict += f" ({d:+.3f})"
        lines.append(f"| {key[0]} | {key[1]} | " + " | ".join(cells) + f" | {verdict} |")
        best_gaps.append(max(ms.values()) - ms["ours"])
    lines += ["", "## Summary", ""]
    if gaps:
        lines.append(f"- Against FLAML on dataset averages (ties are differences under {TIE}): **{wins} wins, {ties} ties, {losses} losses**. Median difference {np.median(gaps):+.3f} (average {np.mean(gaps):+.3f}, pulled up by any run where FLAML failed, see below).")
    gbm = [float(np.mean(table[k]["ours"])) - float(np.mean(table[k]["default_gbm"])) for k in names if "default_gbm" in table[k]]
    if gbm:
        lines.append(f"- Against a default gradient boosting model, which needs no tuning and is steady from run to run: **{sum(d > TIE for d in gbm)} wins, {sum(abs(d) <= TIE for d in gbm)} ties, {sum(d < -TIE for d in gbm)} losses**. Average difference: {np.mean(gbm):+.3f}.")
    erratic = [(r["dataset"], r["seed"]) for r in rows if "score" in r["methods"].get("flaml", {}) and r["methods"]["flaml"]["score"] < r["methods"]["baseline"]["score"]]
    n_flaml = sum("score" in r["methods"].get("flaml", {}) for r in rows)
    if n_flaml:
        lines.append(f"- FLAML scored below the do-nothing baseline on {len(erratic)} of {n_flaml} runs. It is limited by the time budget, so one unlucky search can fail badly. That flatters our numbers, and the default gradient boosting column is the steadier reference.")
    lines.append(f"- Our score was within 0.02 of the best method on {sum(g <= 0.02 for g in best_gaps)} of {len(best_gaps)} datasets.")
    ours_rows = [r["methods"]["ours"] for r in rows]
    lines.append(f"- Median time: ours {np.median([o['seconds'] for o in ours_rows]):.0f}s per run. FLAML was given the same wall-clock time (10 to 60s).")
    picks = Counter(o["model"] for o in ours_rows)
    lines.append("- Models our system recommended: " + ", ".join(f"{m} ({n})" for m, n in picks.most_common()) + ".")
    reviews = Counter(o["review"] for o in ours_rows)
    lines.append("- Reviewer verdicts across all runs: " + ", ".join(f"{k} {v}" for k, v in reviews.items()) + ".")
    reds = Counter(o["redteam"] or "skipped" for o in ours_rows)
    lines.append("- Red team verdicts: " + ", ".join(f"{k} {v}" for k, v in reds.items()) + ".")
    for field, label in (("review", "Reviewer"), ("redteam", "Red team")):
        flagged = Counter(r["dataset"] for r in rows if r["methods"]["ours"].get(field) == "fail")
        if flagged:
            lines.append(f"- {label} said fail on: " + ", ".join(f"{d} ({n} of {cfg['seeds']} splits)" for d, n in flagged.items()) + ".")
    ld = state.get("leak_demo")
    if ld:
        lines += ["", "## Leak detection", "", f"Titanic with the `alive` column left in (it is just the target spelled out). Reviewer verdict: **{ld['review']}**. Findings: " + "; ".join(ld["findings"]) + "."]
    lines += [
        "",
        "## How to read this fairly",
        "",
        "- Our system is built to be trustworthy first. It prefers a simpler model when the scores are within one standard deviation, so it can score a little below the single best model. FLAML only optimises the score.",
        f"- Our tuning budget was {cfg['tuning_budget']:.0f}s, and datasets were capped at {cfg['max_rows']:,} rows so the whole benchmark runs on a laptop.",
        f"- {cfg['seeds']} splits is a small sample. Differences under about 0.01 are noise.",
        "- FLAML received raw columns and did its own preprocessing. Ours used its own cleaning. Both saw the same training rows and were scored on the same test rows.",
        f"- Rerun it yourself: `python benchmark/run_benchmark.py --seeds {cfg['seeds']} --budget {cfg['tuning_budget']:.0f} --max-rows {cfg['max_rows']}`. FLAML is time-limited, so its numbers move a little between runs.",
        "",
        "## Calibration note",
        "",
        "A first run of this benchmark had the Reviewer say fail on 6 of 36 runs and the Red team say fail on 11 of 36, all on ordinary datasets. Those verdicts were too jumpy: one rule treated any very high score as a likely leak, and the Red team judged damage by the raw score drop. We changed them to skill-relative thresholds (share of the model's edge over guessing that is lost: 25% is a weak spot, 50% is broken, stricter for noise), made a very high score a caution instead of a fail, and reran everything. The thresholds were set from principle, not tuned per dataset, but they were chosen after seeing these datasets, so read the verdict counts as illustrative. Model scores were not affected by this change.",
        "",
        "## Datasets",
        "",
    ]
    seen = set()
    for r in rows:
        if r["dataset"] not in seen:
            seen.add(r["dataset"])
            lines.append(f"- **{r['dataset']}**: {r['note']} ({r['n_train'] + r['n_test']:,} rows used)")
    path.write_text("\n".join(lines) + "\n", encoding="utf-8")
