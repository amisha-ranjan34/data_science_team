import type { ModelResult, Result, Step } from "@/lib/types";
import Timeline from "./Timeline";

const METRIC_LABELS: Record<string, string> = {
  r2: "R²",
  rmse: "RMSE",
  mae: "MAE",
  accuracy: "Accuracy",
  f1_macro: "Macro F1",
  roc_auc: "ROC AUC",
};

function fmt(key: string, v: number) {
  if (key === "rmse" || key === "mae") return Math.round(v).toLocaleString();
  return v.toFixed(3);
}

function bar(v: number) {
  return Math.min(Math.max(v, 0), 1) * 100;
}

function Leaderboard({ result }: { result: Result }) {
  const baseline = result.models.find((m) => m.complexity === 0);
  const baselinePct = baseline ? bar(baseline.cv_mean) : 0;
  const pick = result.recommendation.model;

  return (
    <div className="space-y-3">
      {result.models.map((m: ModelResult, idx: number) => {
        const isPick = m.name === pick;
        return (
          <article
            key={m.name}
            className={
              "rounded-xl border p-4 sm:p-5 transition-all " +
              (isPick
                ? "border-cyan-500/80 bg-gradient-to-r from-cyan-950/30 via-surface to-surface shadow-glow-card ring-1 ring-cyan-500/30"
                : "border-line bg-surface/70 hover:bg-surface-elevated/60")
            }
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-3">
                <span
                  className={
                    "grid h-6 w-6 place-items-center rounded-md font-mono text-xs font-bold " +
                    (isPick ? "bg-cyan-500 text-slate-950" : "bg-surface-elevated text-slate-400 border border-line")
                  }
                >
                  #{idx + 1}
                </span>
                <h3 className="text-base font-bold text-white flex items-center gap-2">
                  {m.name}
                  {isPick && (
                    <span className="rounded-full bg-cyan-500/20 border border-cyan-500/40 px-2.5 py-0.5 text-xs font-bold text-cyan-300">
                      ★ Recommended
                    </span>
                  )}
                  {m.rank === 1 && !isPick && (
                    <span className="rounded-full bg-surface-elevated border border-line px-2.5 py-0.5 text-xs font-bold text-slate-400">
                      Highest score
                    </span>
                  )}
                </h3>
              </div>

              <p className="text-xs sm:text-sm text-slate-300 font-mono">
                {result.primary_metric.toUpperCase()}: <span className="font-bold text-cyan-300">{m.cv_mean.toFixed(3)}</span>{" "}
                <span className="text-slate-500">± {m.cv_std.toFixed(3)}</span>
              </p>
            </div>

            <div className="relative mt-3.5 h-2.5 rounded-full bg-[#0B1120] border border-line/60" aria-hidden>
              <div
                className={
                  "h-full rounded-full transition-all duration-700 " +
                  (isPick
                    ? "bg-gradient-to-r from-cyan-500 to-blue-500 shadow-glow-sm"
                    : "bg-slate-600")
                }
                style={{ width: `${bar(m.cv_mean)}%` }}
              />
              {m.complexity > 0 && (
                <div
                  className="absolute top-[-3px] h-[16px] w-[2px] bg-amber-400 shadow-[0_0_6px_rgba(251,191,36,0.8)]"
                  style={{ left: `${baselinePct}%` }}
                  title="Baseline Score Threshold"
                />
              )}
            </div>

            <dl className="mt-3 flex flex-wrap gap-x-6 gap-y-1 text-xs">
              {Object.entries(m.test).map(([k, v]) => (
                <div key={k} className="flex items-center gap-1.5 font-mono">
                  <dt className="text-muted">{METRIC_LABELS[k] ?? k}:</dt>
                  <dd className="font-semibold text-slate-200">{fmt(k, v)}</dd>
                </div>
              ))}
              <div className="flex items-center gap-1.5 font-mono">
                <dt className="text-muted">Train Time:</dt>
                <dd className="font-semibold text-slate-300">{m.seconds}s</dd>
              </div>
            </dl>
          </article>
        );
      })}
      <p className="text-xs text-muted">The thin vertical mark on each bar shows the baseline score. A model needs to clear it clearly to be worth using.</p>
    </div>
  );
}

export default function Results({ result, steps, onReset }: { result: Result; steps: Step[]; onReset: () => void }) {
  const rec = result.recommendation;
  const ok = rec.verdict === "ok";

  const trainTotal = result.split.train + result.split.test;
  const trainPct = trainTotal > 0 ? Math.round((result.split.train / trainTotal) * 100) : 80;
  const testPct = 100 - trainPct;

  return (
    <div className="space-y-6">
      {/* Top Action Header with prominent "Back to Start" button */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-line bg-surface/80 p-4 backdrop-blur-sm">
        <button
          onClick={onReset}
          className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 px-4 py-2 text-xs font-bold text-white shadow-glow transition-all hover:from-cyan-400 hover:to-blue-500"
        >
          <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <path d="M19 12H5M12 19l-7-7 7-7" />
          </svg>
          Back to Start
        </button>

        <div className="flex flex-wrap items-center gap-2 text-xs font-mono">
          <span className="rounded-md border border-line bg-surface-elevated px-2.5 py-1 text-slate-300">
            Target: <span className="font-bold text-white">{result.target}</span>
          </span>
          <span className="rounded-md border border-line bg-surface-elevated px-2.5 py-1 capitalize text-cyan-300">
            {result.task}
          </span>
          <span className="rounded-md border border-cyan-500/30 bg-cyan-950/20 px-2.5 py-1 text-cyan-400">
            Metric: {result.primary_metric.toUpperCase()}
          </span>
        </div>
      </div>

      {/* Train / Test Split Breakdown Card */}
      <section className="rounded-2xl border border-line bg-surface/80 p-5 backdrop-blur-sm shadow-glow-card">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line/60 pb-3">
          <div className="flex items-center gap-2">
            <span className="grid h-7 w-7 place-items-center rounded-lg bg-indigo-500/10 border border-indigo-500/30 text-indigo-400 text-xs font-bold">
              ⇄
            </span>
            <h3 className="text-sm font-bold text-white">Train / Test Split & Dataset Summary</h3>
          </div>
          <span className="rounded-md border border-line bg-[#0B1120] px-2 py-0.5 text-[11px] font-mono text-slate-400">
            {result.split.cv_folds}-Fold Cross-Validation
          </span>
        </div>

        {/* Visual Split Ratio Bar */}
        <div className="mt-4">
          <div className="flex justify-between text-xs font-mono text-muted mb-1.5">
            <span className="text-cyan-400 font-semibold">Train Set: {result.split.train.toLocaleString()} rows ({trainPct}%)</span>
            <span className="text-indigo-400 font-semibold">Test Set: {result.split.test.toLocaleString()} rows ({testPct}%)</span>
          </div>
          <div className="h-3 w-full overflow-hidden rounded-full border border-line/60 bg-[#0B1120] flex" aria-hidden>
            <div className="h-full bg-cyan-500 transition-all" style={{ width: `${trainPct}%` }} title="Train Split" />
            <div className="h-full bg-indigo-500 transition-all" style={{ width: `${testPct}%` }} title="Test Split" />
          </div>
        </div>

        {/* Stats Grid */}
        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4 text-xs font-mono">
          <div className="rounded-xl border border-line bg-[#0B1120] p-3">
            <span className="text-muted block text-[11px]">Cleaned Samples</span>
            <span className="text-base font-bold text-white">{result.n_rows.toLocaleString()}</span>
          </div>
          <div className="rounded-xl border border-line bg-[#0B1120] p-3">
            <span className="text-muted block text-[11px]">Active Features</span>
            <span className="text-base font-bold text-cyan-300">{result.n_features}</span>
          </div>
          <div className="rounded-xl border border-line bg-[#0B1120] p-3">
            <span className="text-muted block text-[11px]">Dropped Cols</span>
            <span className="text-base font-bold text-slate-300">{result.dropped_columns.length}</span>
          </div>
          <div className="rounded-xl border border-line bg-[#0B1120] p-3">
            <span className="text-muted block text-[11px]">Validation Folds</span>
            <span className="text-base font-bold text-indigo-300">{result.split.cv_folds}</span>
          </div>
        </div>

        {result.dropped_columns.length > 0 && (
          <div className="mt-3 rounded-lg border border-line bg-[#0B1120] p-3 text-xs text-muted">
            <span className="font-semibold text-slate-300">Dropped columns:</span>{" "}
            {result.dropped_columns.map((d) => (
              <span key={d.column} className="mr-3 inline-block font-mono text-[11px] text-slate-400">
                {d.column} ({d.reason})
              </span>
            ))}
          </div>
        )}
      </section>

      {/* Recommendation Card */}
      <section
        className={
          "relative overflow-hidden rounded-2xl p-6 backdrop-blur-md transition-all " +
          (ok
            ? "border border-cyan-500/40 bg-gradient-to-br from-cyan-950/40 via-surface to-surface shadow-glow-card"
            : "border border-amber-500/40 bg-gradient-to-br from-amber-950/40 via-surface to-surface")
        }
      >
        <p className="text-xs font-bold uppercase tracking-wider text-slate-300">
          {ok ? "Recommendation" : "No reliable model found"}
        </p>
        <h2 className="mt-1 text-2xl font-black text-white sm:text-3xl">
          {ok ? rec.model : "The baseline is as good as any model"}
        </h2>
        <p className="mt-3 max-w-2xl text-sm leading-relaxed text-slate-200">
          {rec.explanation ?? rec.reason}
        </p>
        {rec.explanation && (
          <p className="mt-3 text-xs text-slate-400">
            Explained by an AI agent using only the measured results. The ranking and recommendation come from the tested code.
          </p>
        )}
      </section>

      {/* Model Comparison Leaderboard */}
      <section className="space-y-4">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <div>
            <h2 className="text-base font-bold text-white">Model comparison</h2>
            <p className="text-xs text-slate-400 font-mono">
              Predicting <span className="font-semibold text-cyan-300">{result.target}</span> ({result.task}). Ranked by cross-validated {result.primary_metric}, {result.split.cv_folds} folds.
            </p>
          </div>
          <button onClick={onReset} className="text-xs font-semibold text-cyan-400 hover:text-cyan-300 hover:underline">
            Try another file
          </button>
        </div>
        <Leaderboard result={result} />
      </section>

      {/* Plan Details if Available */}
      {result.plan && (
        <section className="rounded-xl border border-line bg-surface/80 p-4 sm:p-5 backdrop-blur-sm">
          <h3 className="font-bold text-white text-sm">The plan the team followed</h3>
          <p className="mt-2 text-xs leading-relaxed text-slate-300">{result.plan.rationale}</p>
          <p className="mt-2 text-[11px] text-muted">
            {result.plan.source === "ai" ? "Planned by an AI agent and checked by code." : "Built-in rules (no AI)."}
            {result.plan.target_transform === "log" ? " Target modelled on a log scale." : ""}
          </p>
        </section>
      )}

      {/* Timeline Steps */}
      {steps.length > 0 && (
        <details className="rounded-xl border border-line bg-surface/80 p-4 sm:p-5 backdrop-blur-sm">
          <summary className="cursor-pointer font-bold text-white text-sm">How the team got here</summary>
          <div className="mt-4"><Timeline steps={steps} /></div>
        </details>
      )}

      {/* Warnings */}
      {result.warnings.length > 0 && (
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 text-xs text-amber-200 space-y-1">
          <p className="font-semibold text-amber-300">Pipeline Alerts</p>
          <ul className="list-inside list-disc space-y-0.5 text-amber-200">
            {result.warnings.map((w) => (
              <li key={w}>{w}</li>
            ))}
          </ul>
        </div>
      )}

      {/* Bottom CTA to Return to Start */}
      <div className="flex flex-col items-center justify-center gap-3 border-t border-line/60 pt-8 pb-4">
        <button
          onClick={onReset}
          className="inline-flex items-center gap-2.5 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 px-7 py-3.5 text-sm font-bold text-white shadow-glow transition-all hover:from-cyan-400 hover:to-blue-500 hover:scale-[1.02]"
        >
          <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8" />
            <path d="M21 3v5h-5" />
            <path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16" />
            <path d="M8 16H3v5" />
          </svg>
          Back to Start — Analyze Another Dataset
        </button>
      </div>
    </div>
  );
}
