# Auto Data Science Team

Upload a CSV. The app profiles it, cleans it, trains several models, tests them fairly and recommends one with a plain-language reason.

## Phase 3 status
- Reviewer agent (code checks): single-column leakage probe, train versus test gap, score plausibility, class balance, test set size, fold stability
- Tuner: time-boxed random search on the best model, added to the leaderboard as a "(tuned)" row
- Downloads: trained model (.joblib), a reproducible `train_model.py` script and a short `report.md`
- Runs are saved to disk, so a server restart no longer loses them

Set `TUNING_BUDGET_SECONDS=0` in `backend/.env` to switch tuning off.

## Phase 2 status
- Agent team built with Agno: Profiler, Planner, Cleaner, Modeler and Advisor, with a live timeline in the UI
- LLM agents (Profiler, Planner, Advisor) only write text and a validated plan. All ML work is tested code, and every agent has a rule-based fallback
- Works with Groq, Gemini, OpenAI or Anthropic. With no key, the team runs in offline mode
- Smart preprocessing: log-transform for skewed positive targets

To switch AI on, copy `backend/.env.example` to `backend/.env` and add one key.

## Phase 1 status
- Deterministic ML core (no LLM yet): leak-safe sklearn pipelines, cross-validation, hold-out test
- Honest recommendation: prefers a simpler model within one standard deviation of the best, and says so when nothing beats the baseline
- FastAPI backend with background training and progress polling
- Responsive Next.js UI

## Run it

### Backend (terminal 1)
```bash
cd backend
python -m venv .venv
# Windows: .venv\Scripts\activate    macOS/Linux: source .venv/bin/activate
pip install -r requirements-dev.txt
uvicorn app.main:app --reload --port 8000
```
Check http://localhost:8000/api/health and the API docs at http://localhost:8000/docs.

### Frontend (terminal 2)
```bash
cd frontend
cp .env.local.example .env.local   # Windows: copy .env.local.example .env.local
npm install
npm run dev
```
Open http://localhost:3000.

### Tests
```bash
cd backend && pytest
```

## Structure
```
backend/app/profiling.py   read CSV, column profile, suggest target and task
backend/app/pipeline.py    choose columns, build the preprocessing pipeline
backend/app/modeling.py    train, cross-validate, test, recommend
backend/app/main.py        API: POST /api/runs, POST /api/runs/{id}/train, GET /api/runs/{id}
frontend/                  Next.js (App Router) + Tailwind
```

## Roadmap
Phase 2 agents and live timeline, Phase 3 reviewer agent and tuning, Phase 4 database, auth, Docker, CI, Phase 5 red-team agent and AutoML benchmark.
