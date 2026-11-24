# Benchmark results

12 public datasets, 3 random splits each, one run per split. Score is R² for regression and macro F1 for classification, on rows no method saw while learning (higher is better).

| Dataset | Type | Baseline | Default GBM | FLAML | Ours | Ours vs FLAML |
|---|---|---|---|---|---|---|
| diabetes | regression | -0.003 | 0.269 | 0.370 | 0.416 | win (+0.047) |
| car_details | regression | -0.001 | 0.548 | -0.107 | 0.523 | win (+0.630) |
| mpg | regression | -0.008 | 0.876 | 0.871 | 0.845 | loss (-0.027) |
| tips | regression | -0.003 | 0.364 | 0.466 | 0.400 | loss (-0.066) |
| diamonds | regression | -0.003 | 0.962 | 0.970 | 0.965 | loss (-0.005) |
| healthexp | regression | -0.000 | 0.978 | 0.988 | 0.981 | loss (-0.007) |
| breast_cancer | classification | 0.386 | 0.945 | 0.948 | 0.962 | win (+0.015) |
| wine | classification | 0.190 | 1.000 | 0.993 | 0.985 | loss (-0.008) |
| digits | classification | 0.019 | 0.971 | 0.971 | 0.962 | loss (-0.009) |
| titanic | classification | 0.370 | 0.789 | 0.790 | 0.808 | win (+0.018) |
| penguins | classification | 0.204 | 0.975 | 0.984 | 0.992 | win (+0.008) |
| taxis | classification | 0.422 | 0.539 | 0.547 | 0.539 | loss (-0.007) |

## Summary

- Against FLAML on dataset averages (ties are differences under 0.005): **5 wins, 0 ties, 7 losses**. Median difference -0.006 (average +0.049, pulled up by any run where FLAML failed, see below). In short: roughly on par, slightly behind on most datasets.
- Against a default gradient boosting model, which needs no tuning and is steady from run to run: **5 wins, 3 ties, 4 losses**. Average difference: +0.014.
- FLAML scored below the do-nothing baseline on 1 of 36 runs. It is limited by the time budget, so one unlucky search can fail badly. That flatters our numbers, and the default gradient boosting column is the steadier reference.
- Our score was within 0.02 of the best method on 9 of 12 datasets.
- Median time: ours 6s per dataset. FLAML was given the same wall-clock time (10 to 60s).
- Models our system recommended: Ridge regression (15), Logistic regression (14), Gradient boosting (5), Ridge regression (tuned) (1), Gradient boosting (tuned) (1).
- Reviewer verdicts across all runs: caution 24, pass 12.
- Red team verdicts: pass 18, caution 14, fail 4.
- Red team said fail on: tips (1 of 3 splits), diamonds (2 of 3 splits), healthexp (1 of 3 splits).

## Leak detection

Titanic with the `alive` column left in (it is just the target spelled out). Reviewer verdict: **fail**. Findings: 'alive' alone predicts the target; The score is unusually high.

## How to read this fairly

- Our system is built to be trustworthy first. It prefers a simpler model when the scores are within one standard deviation, so it can score a little below the single best model. FLAML only optimises the score.
- Our tuning budget was 8s, and datasets were capped at 3,000 rows so the whole benchmark runs on a laptop.
- 3 splits is a small sample. Differences under about 0.01 are noise.
- FLAML received raw columns and did its own preprocessing. Ours used its own cleaning. Both saw the same training rows and were scored on the same test rows.
- Rerun it yourself: `python benchmark/run_benchmark.py --seeds 3 --budget 8 --max-rows 3000`. FLAML is time-limited, so its numbers move a little between runs.

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
