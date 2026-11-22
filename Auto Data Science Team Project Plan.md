# Auto Data Science Team: Project Plan

By Amisha

## Overview

I am building a full-stack app where a user uploads any CSV file and an agent team profiles it, cleans it, trains several models, evaluates them honestly and recommends the best one, with every decision explained. The project extends the Agno data science team course project. My goal is a portfolio piece that works for full-stack, backend and AI/ML engineer roles.

## Architecture

- **Frontend:** Next.js with a live agent timeline, charts and a results dashboard.
- **Backend:** FastAPI with Agno (a Team plus specialist agents).
- **Jobs:** a background queue (Celery or RQ with Redis) so training never blocks requests. Progress streams to the UI over SSE or WebSocket.
- **Storage:** Postgres or SQLite for runs and metadata, and local or S3 storage for files and model artifacts.
- **Execution:** ML code runs inside a Docker sandbox, not on the host.

The key design decision: the LLM does not write free-form code for everything. It produces a structured JSON plan such as "impute median, one-hot these columns, try these four models", and tested deterministic functions built on sklearn Pipelines execute it. This is more reliable, cheaper and easier to defend in an interview.

## Pipeline

1. **Ingest agent:** validates size, encoding, delimiter and column types.
2. **Profiler agent:** checks missing values, cardinality, skew, ID-like columns, leakage suspects and duplicates.
3. **Task agent:** proposes the target column (the user confirms) and infers classification or regression plus class imbalance.
4. **Cleaning agent:** outputs the cleaning plan, which runs inside a sklearn Pipeline after the train/test split so there is no leakage.
5. **Modeling agent:** picks candidates from the data's size and shape. A dummy baseline and a linear model are always included, then random forest, XGBoost and LightGBM. It uses cross-validation and a time-boxed Optuna tuning budget.
6. **Evaluation agent:** applies task-appropriate metrics (RMSE, MAE and R² or F1, AUC and PR-AUC), CV mean and standard deviation, and plots such as residuals, confusion matrix and SHAP.
7. **Reviewer agent:** checks for leakage, overfitting gaps and scores that look too good to be true.
8. **Recommendation agent:** picks the winner and explains the trade-offs between accuracy, speed and interpretability.

## Phased Build

- **Phase 1, MVP :** upload, profile, clean, train three or four models and show a metrics table in a basic UI. Tabular classification and regression only.
- **Phase 2, agents and streaming :** the Agno team, structured plans and the live timeline.
- **Phase 3, rigor:** reviewer agent, baseline policy, tuning and downloadable artifacts (model, pipeline code and report).
- **Phase 4, production polish :** auth, Docker, CI, tests, error handling, a deployed demo and a README with an architecture diagram.
- **Phase 5, edge features :** pick from the list below.

## Edge Features

- **Red-team agent:** tries to break the winning model with feature perturbations, subgroup performance gaps and leakage probes, then reports weaknesses.
- **Honest-baseline rule:** if a simple model is within one standard error of the best, recommend the simple one. This connects to my Nifty50 finding that simple methods beat complex ones.
- **AutoML benchmark:** run the system on 10 to 20 OpenML datasets and compare with FLAML or AutoGluon in a README table.
- **Eject to code:** download a clean, reproducible notebook or script of everything the team did.
- **Decision log:** every step records why it was chosen.
- **One-click prediction API:** generate a small FastAPI endpoint or form page for the trained model.
- **What-if chat:** "what if I drop this column?" re-runs only the affected steps.
- **Observability:** per-run token cost, latency and agent traces.
- **Human approval checkpoints:** the user confirms the target column and risky cleaning steps.

## Full Stack and Job Applications

Adding a UI turns this into a real full-stack app, and my earlier Next.js and FastAPI work fits the stack. It suits full-stack, backend and AI/ML engineer roles best. Recruiters for general SDE roles care more about engineering quality than the number of agents, so I will prioritize:

- A deployed live demo
- Tests and CI
- Docker, a job queue, sandboxing and auth
- A clear README with an architecture diagram
- A short list of measured results for my resume, for example the benchmark outcome against AutoGluon

## Risks

- **Unsafe code execution:** the sandbox is essential.
- **Large or messy files:** set size limits and sample for speed.
- **LLM cost and rate limits:** use free-tier or cheaper models for the agents and keep heavy computation in plain Python.
- **Scope creep:** finish the MVP before any edge features.

## Next Steps

- Write the project folder structure and API design.
- Build the Phase 1 backend skeleton.
