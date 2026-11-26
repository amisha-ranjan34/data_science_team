# Benchmark results

16 public datasets, 5 random splits each, one run per split. Score is R² for regression and macro F1 for classification, on rows no method saw while learning (higher is better).

| Dataset | Type | Baseline | Default GBM | FLAML | Ours | Ours vs FLAML |
|---|---|---|---|---|---|---|
| diabetes | regression | -0.003 | 0.287 | 0.391 | 0.429 | win (+0.038) |
| car_details | regression | -0.000 | 0.528 | 0.078 | 0.515 | win (+0.436) |
| mpg | regression | -0.010 | 0.878 | 0.870 | 0.844 | loss (-0.026) |
| tips | regression | -0.020 | 0.402 | 0.445 | 0.416 | loss (-0.029) |
| diamonds | regression | -0.003 | 0.962 | 0.962 | 0.959 | tie (-0.002) |
| healthexp | regression | -0.002 | 0.979 | 0.945 | 0.980 | win (+0.034) |
| breast_cancer | classification | 0.386 | 0.953 | 0.950 | 0.968 | win (+0.018) |
| wine | classification | 0.190 | 0.982 | 0.991 | 0.973 | loss (-0.018) |
| digits | classification | 0.019 | 0.975 | 0.968 | 0.967 | tie (-0.000) |
| titanic | classification | 0.370 | 0.780 | 0.788 | 0.796 | win (+0.008) |
| penguins | classification | 0.204 | 0.977 | 0.985 | 0.995 | win (+0.011) |
| taxis | classification | 0.422 | 0.545 | 0.548 | 0.539 | loss (-0.010) |
| car_crashes | regression | -0.055 | -0.055 | 0.836 | 0.883 | win (+0.047) |
| iris | classification | 0.170 | 0.962 | 0.913 | 0.968 | win (+0.054) |
| geyser | regression | -0.013 | 0.806 | 0.823 | 0.833 | win (+0.009) |
| exercise | regression | -0.015 | 0.548 | 0.666 | 0.443 | loss (-0.223) |

## Summary

- Against FLAML on dataset averages (ties are differences under 0.005): **9 wins, 2 ties, 5 losses**. Median difference +0.009 (average +0.022, pulled up by any run where FLAML failed, see below).
- Against a default gradient boosting model, which needs no tuning and is steady from run to run: **8 wins, 2 ties, 6 losses**. Average difference: +0.062.
- FLAML scored below the do-nothing baseline on 1 of 80 runs. It is limited by the time budget, so one unlucky search can fail badly. That flatters our numbers, and the default gradient boosting column is the steadier reference.
- Our score was within 0.02 of the best method on 13 of 16 datasets.
- Median time: ours 12s per run. FLAML was given the same wall-clock time (10 to 60s).
- Models our system recommended: Ridge regression (38), Logistic regression (27), Gradient boosting (7), Ridge regression (tuned) (3), Random forest (3), Gradient boosting (tuned) (1), none (baseline) (1).
- Reviewer verdicts across all runs: caution 57, pass 20, fail 3.
- Red team verdicts: pass 41, caution 30, fail 8, skipped 1.
- Reviewer said fail on: iris (3 of 5 splits).
- Red team said fail on: tips (1 of 5 splits), diamonds (4 of 5 splits), healthexp (1 of 5 splits), exercise (2 of 5 splits).

## Leak detection

Titanic with the `alive` column left in (it is just the target spelled out). Reviewer verdict: **fail**. Findings: 'alive' alone predicts the target; The score is unusually high.

## How to read this fairly

- Our system is built to be trustworthy first. It prefers a simpler model when the scores are within one standard deviation, so it can score a little below the single best model. FLAML only optimises the score.
- Our tuning budget was 8s, and datasets were capped at 3,000 rows so the whole benchmark runs on a laptop.
- 5 splits is a small sample. Differences under about 0.01 are noise.
- FLAML received raw columns and did its own preprocessing. Ours used its own cleaning. Both saw the same training rows and were scored on the same test rows.
- Rerun it yourself: `python benchmark/run_benchmark.py --seeds 5 --budget 8 --max-rows 3000`. FLAML is time-limited, so its numbers move a little between runs.

## Calibration note

A first run of this benchmark had the Reviewer say fail on 6 of 36 runs and the Red team say fail on 11 of 36, all on ordinary datasets. Those verdicts were too jumpy: one rule treated any very high score as a likely leak, and the Red team judged damage by the raw score drop. We changed them to skill-relative thresholds (share of the model's edge over guessing that is lost: 25% is a weak spot, 50% is broken, stricter for noise), made a very high score a caution instead of a fail, and reran everything. The thresholds were set from principle, not tuned per dataset, but they were chosen after seeing these datasets, so read the verdict counts as illustrative. Model scores were not affected by this change.

## Datasets

- **diabetes**: sklearn, 442 rows (442 rows used)
- **car_details**: used cars, many duplicate rows (3,000 rows used)
- **mpg**: fuel economy, has a free-text name column (398 rows used)
- **tips**: restaurant tips, 244 rows (243 rows used)
- **diamonds**: sampled to the row cap (3,000 rows used)
- **healthexp**: health spending by country (274 rows used)
- **breast_cancer**: sklearn, 30 numeric features (569 rows used)
- **wine**: sklearn, 178 rows, 3 classes (178 rows used)
- **digits**: sklearn, 64 pixels, 10 classes (1,797 rows used)
- **titanic**: 'alive' dropped: it repeats the target (784 rows used)
- **penguins**: 3 species, has missing values (344 rows used)
- **taxis**: 'tip' and 'total' dropped (cash tips are not recorded); raw timestamps dropped (3,000 rows used)
- **car_crashes**: state road-safety observations (51 rows used)
- **iris**: classic 3-species classification dataset (149 rows used)
- **geyser**: Old Faithful eruption and waiting times (256 rows used)
- **exercise**: repeated measurements; row index and subject IDs excluded (85 rows used)
