# Auto Data Science Team

Upload a CSV. A team of agents profiles it, cleans it, trains and tunes several models, reviews the result and recommends the one to trust, with the reasoning shown step by step.

![CI](https://github.com/amisha-ranjan34/auto-ds-team/actions/workflows/ci.yml/badge.svg)

## What it does
- **Any CSV in, a decision out.** Detects the target and problem type, then compares a baseline, a linear model, a random forest and gradient boosting.
- **Honest by design.** Leak-safe pipelines (everything is fitted on training data only), duplicates removed before the split, and a recommendation rule that prefers the simpler model when scores are within one standard deviation. It says so when no model beats the baseline.
- **A Reviewer that argues back.** Six code-based checks catch leakage, overfitting, impossible scores, imbalance, tiny test sets and unstable folds.
- **A Red team that attacks the winner.** Before you trust the recommended model, it is hit with noisy inputs, missing values, unseen categories, weak subgroups and single-column dependence, and the damage is reported.
- **Measured against a real AutoML library.** A benchmark on public datasets compares it with FLAML under the same time budget (see [benchmark/RESULTS.md](benchmark/RESULTS.md)).
- **Live progress.** The timeline streams over server-sent events, with polling as a fallback.
- **Agents with a safety net.** LLM agents plan and explain, tested code does the ML, and every agent has a rule-based fallback, so a bad or missing AI answer never breaks a run.
- **Take it with you.** Download the trained model, a reproducible `train_model.py` and a short report.
- **What-if analysis.** Ask what changes when a feature column is removed; the original upload/profile and model plan are reused, while training and review run again for a comparable result.
- **Real app basics.** Accounts, per-user run history, daily limits, health check, Docker and CI.

## Architecture
```mermaid
flowchart LR
    UI["Next.js UI"] -->|"JWT over HTTPS"| API["FastAPI"]
    API --> DB[("SQLite or Postgres")]
    API --> FS[("Run files: CSV, model, report")]
    API -->|"background thread"| P["Profiler (AI)"]
    P --> PL["Planner (AI)"]
    PL --> C["Cleaner"]
    C --> M["Modeler"]
    M --> T["Tuner"]
    T --> R["Reviewer"]
    R --> RT["Red team"]
    RT --> A["Advisor (AI)"]
    P -.-> LLM[("Groq, Gemini, OpenAI or Anthropic via Agno")]
    PL -.-> LLM
    A -.-> LLM
```

| Agent | Job | Uses an LLM |
|---|---|---|
| Profiler | Summarises the dataset and its risks | Yes, with fallback |
| Planner | Chooses models, target transform and columns to drop. Code validates the plan | Yes, with fallback |
| Cleaner | Removes duplicates and unusable columns | No |
| Modeler | Cross-validates and tests each model | No |
| Tuner | Time-boxed random search on the best model | No |
| Reviewer | Leakage, overfitting and stability checks | No |
| Red team | Stress-tests the recommended model with five attacks | No |
| Advisor | Explains the result in plain language using only measured numbers | Yes, with fallback |

## Quick start (local)
Needs Python 3.12 or newer and Node.js 20 or newer.

```bash
# Terminal 1: backend
cd backend
uv sync                         # or: python -m venv .venv, activate it, pip install -r requirements-dev.txt
cp .env.example .env            # optional: add one AI key to switch the agents on
uv run python -m uvicorn app.main:app --reload --port 8000

# Terminal 2: frontend
cd frontend
cp .env.local.example .env.local
npm install
npm run dev
```
Open http://localhost:3000, create an account, verify the email and upload a CSV. Locally, if SMTP is not configured, the API returns a development-only verification code. Without an AI key the app still works in rule-based mode.

## Quick start (Docker)
```bash
cp .env.example .env            # set SECRET_KEY (the file shows how to generate one)
cp backend/.env.example backend/.env   # configure SMTP for production sign-up; AI keys and S3 storage are optional
docker compose up --build
```
Frontend on http://localhost:3000, API on http://localhost:8000. Data lives in the `backend-data` volume.

## Configuration
| Variable | Where | Purpose |
|---|---|---|
| `SECRET_KEY` | backend | Signs login tokens. Required when `ENV=production` |
| `ENV` | backend | `production` enforces the secret key |
| `ALLOWED_ORIGINS` | backend | Comma-separated frontend URLs allowed by CORS |
| `DATABASE_URL` | backend | SQLite by default. A Postgres URL also works (`pip install "psycopg[binary]"`) |
| `DATA_DIR` | backend | Where uploads and the SQLite file are stored; local artifacts also use this directory |
| `ALLOW_REGISTRATION` | backend | `false` closes sign-ups |
| `MAX_RUNS_PER_DAY` | backend | Upload limit per user per day (default 30) |
| `AUTH_COOKIE_SAMESITE` | backend | Session-cookie policy (`lax` locally; defaults to `none` in production for separate frontend/API hosts) |
| `FRONTEND_URL` | backend | Frontend origin used to build verification links |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USERNAME`, `SMTP_PASSWORD`, `SMTP_FROM`, `SMTP_STARTTLS` | backend | SMTP delivery for email verification; required to register users in production |
| `VERIFY_TOKEN_HOURS` | backend | Verification-link lifetime (default 24 hours) |
| `ARTIFACT_STORAGE` | backend | `local` (default) or `s3` for downloadable model/report files |
| `ARTIFACT_BUCKET`, `AWS_REGION`, `S3_ENDPOINT_URL` | backend | S3 bucket and optional S3-compatible endpoint; credentials use the standard AWS SDK chain |
| `GROQ_API_KEY`, `GOOGLE_API_KEY`, `OPENAI_API_KEY`, `ANTHROPIC_API_KEY` | backend | One key switches the AI agents on. `LLM_MODEL` overrides the model |
| `TUNING_BUDGET_SECONDS` | backend | `0` switches tuning off |
| `NEXT_PUBLIC_API_URL` | frontend | Backend address, set at build time |

## API
| Method and path | Purpose |
|---|---|
| `POST /api/auth/register`, `POST /api/auth/verify-email`, `POST /api/auth/resend-verification`, `POST /api/auth/login`, `POST /api/auth/logout`, `GET /api/auth/me` | Verified accounts and cookie sessions |
| `POST /api/runs` | Upload a CSV and get its profile |
| `POST /api/runs/{id}/train` | Start training in the background |
| `POST /api/runs/{id}/what-if` | Create a comparable feature-removal experiment from a completed run |
| `GET /api/runs/{id}` | Progress, timeline steps and results |
| `GET /api/runs/{id}/events` | The same data as a live server-sent event stream |
| `GET /api/runs`, `DELETE /api/runs/{id}` | History and deletion |
| `GET /api/runs/{id}/download/{model,code,report}` | Files |
| `GET /api/health`, `GET /api/config` | Health check and AI status |

Interactive docs at `/docs` when the backend runs.

The browser uses HttpOnly session cookies and sends the CSRF token automatically. For a separate frontend/API deployment, allow the exact frontend origin in `ALLOWED_ORIGINS` and use HTTPS.

## Benchmark
```bash
pip install -r benchmark/requirements.txt
python benchmark/run_benchmark.py --seeds 5 --budget 8 --max-rows 3000
```
Across 16 public datasets and 5 splits per dataset, the system beats FLAML on 9 dataset averages, ties on 2 and loses on 5; the median score difference is +0.009, and it is within 0.02 of the best method on 13 datasets. Treat these small-sample comparisons cautiously; the added value is the Reviewer and Red team, not just raw score. Results, protocol and caveats are in [benchmark/RESULTS.md](benchmark/RESULTS.md). The benchmark needs FLAML, which pulls in compiled packages, so it is kept out of the app's own requirements.

## Tests and CI
```bash
cd backend && uv run python -m pytest     # ML pipeline, agents, reviewer, red team, accounts, ownership, limits, streaming
cd frontend && npx tsc --noEmit && npm run build
```
GitHub Actions runs both on every push and pull request (`.github/workflows/ci.yml`).

## Deploying a demo
A common free setup: frontend on Vercel, backend from `backend/Dockerfile` on Render or Railway, Postgres on Neon. Free tiers change, so check current limits.
1. Create the database and copy its URL into `DATABASE_URL` (add `psycopg[binary]` to `requirements.txt`).
2. Deploy the backend with `ENV=production`, `SECRET_KEY`, `ALLOWED_ORIGINS` (your frontend URL), `DATABASE_URL` and an AI key.
3. Deploy the frontend with `NEXT_PUBLIC_API_URL` set to the backend URL, then add that frontend URL to `ALLOWED_ORIGINS`.
4. Uploaded CSVs and metadata live on the server disk. Set `ARTIFACT_STORAGE=s3`, `ARTIFACT_BUCKET`, and `AWS_REGION` (plus credentials or an instance role) to store downloadable artifacts in an S3-compatible bucket. Raw uploads still need a persistent disk or separate object-storage configuration.
5. Training runs in a background thread. Small free instances may run out of memory on large files, so keep `MAX_BYTES` modest.

## Security notes
- Passwords are hashed with scrypt. Browser sessions use seven-day HttpOnly JWT cookies, with a session-bound CSRF token required for cookie-authenticated mutations. Production cookies are Secure; configure the frontend origin in `ALLOWED_ORIGINS`.
- Every run is tied to its owner. Other users get a 404, not a 403.
- Limits: 20 MB per file, a daily upload cap per user and one training at a time per user.
- Each open live stream holds one server thread until the run ends, which is fine for a demo but would need an async design for heavy traffic.
- New accounts must verify their email. SMTP is required for registration in production; development mode exposes a verification code only when SMTP is not configured. Password reset is not implemented yet.
- The AI provider receives column names, types, summary statistics and class labels, never raw rows. What-if requests also send the user's question and available feature names to the configured provider.

## Structure
```
backend/app/main.py        API, auth, limits, background training
backend/app/auth.py        password hashing and tokens
backend/app/db.py          users and runs
backend/app/team.py        the agent team
backend/app/llm.py         Agno model access with fallbacks
backend/app/modeling.py    training, tuning, recommendation
backend/app/review.py      the Reviewer checks
backend/app/redteam.py     the Red team stress tests
benchmark/                 benchmark against FLAML on public datasets
backend/app/artifacts.py   model, script and report files
frontend/                  Next.js (App Router) and Tailwind
```

## Roadmap
Password reset, a deployed public demo, and a still broader benchmark with more public datasets and repeated splits.
