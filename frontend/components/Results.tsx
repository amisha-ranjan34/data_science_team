"use client";
import { useState } from "react";
import { downloadFile } from "@/lib/api";
import type { ModelResult, Result, Review, Step } from "@/lib/types";
import Timeline from "./Timeline";

const METRIC_LABELS: Record<string, string> = {
  r2: "R²", rmse: "RMSE", mae: "MAE", accuracy: "Accuracy", f1_macro: "Macro F1", roc_auc: "ROC AUC",
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
      {result.models.map((m: ModelResult) => {
        const isPick = m.name === pick;
        return (
          <article
            key={m.name}
            className={"rounded-xl border bg-surface p-4 sm:p-5 " + (isPick ? "border-accent border-l-4" : "border-line")}
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-base font-bold">
                {m.name}
                {isPick && <span className="ml-3 rounded-full bg-accent-soft px-2.5 py-0.5 text-xs font-bold text-accent-dark">Recommended</span>}
                {m.tuned && <span className="ml-3 rounded-full bg-paper px-2.5 py-0.5 text-xs font-bold text-muted">Tuned</span>}
                {m.rank === 1 && !isPick && <span className="ml-3 rounded-full bg-paper px-2.5 py-0.5 text-xs font-bold text-muted">Highest score</span>}
              </h3>
              <p className="text-sm text-muted">
                {result.primary_metric} <span className="font-bold text-ink">{m.cv_mean.toFixed(3)}</span> ± {m.cv_std.toFixed(3)}
              </p>
            </div>

            <div className="relative mt-3 h-3 rounded-full bg-paper" aria-hidden>
              <div className={"h-full rounded-full " + (isPick ? "bg-accent" : "bg-[#9FB4BC]")} style={{ width: `${bar(m.cv_mean)}%` }} />
              {m.complexity > 0 && <div className="absolute top-[-3px] h-[18px] w-[2px] bg-ink/60" style={{ left: `${baselinePct}%` }} />}
            </div>

            {m.tuned && m.params && (
              <p className="mt-2 text-xs text-muted">Settings: {Object.entries(m.params).map(([k, v]) => `${k}=${v}`).join(", ")}</p>
            )}
            <dl className="mt-3 flex flex-wrap gap-x-6 gap-y-1 text-sm">
              {Object.entries(m.test).map(([k, v]) => (
                <div key={k} className="flex gap-1.5">
                  <dt className="text-muted">Test {METRIC_LABELS[k] ?? k}</dt>
                  <dd className="font-semibold">{fmt(k, v)}</dd>
                </div>
              ))}
              <div className="flex gap-1.5">
                <dt className="text-muted">Train time</dt>
                <dd className="font-semibold">{m.seconds}s</dd>
              </div>
            </dl>
          </article>
        );
      })}
      <p className="text-xs text-muted">The thin vertical mark on each bar shows the baseline score. A model needs to clear it clearly to be worth using.</p>
    </div>
  );
}

const VERDICT = {
  pass: { label: "Passed", cls: "bg-good text-white" },
  caution: { label: "Caution", cls: "bg-warn text-white" },
  fail: { label: "Needs attention", cls: "bg-danger text-white" },
} as const;

function ReviewCard({ review }: { review: Review }) {
  const v = VERDICT[review.verdict];
  return (
    <section className="rounded-xl border border-line bg-surface p-4 sm:p-5">
      <div className="flex flex-wrap items-center gap-3">
        <h3 className="font-bold">Reviewer checks</h3>
        <span className={"rounded-full px-2.5 py-0.5 text-xs font-bold " + v.cls}>{v.label}</span>
      </div>
      {review.findings.length === 0 ? (
        <p className="mt-2 text-sm text-muted">No problems found. Checks run: {review.checks.join(", ").toLowerCase()}.</p>
      ) : (
        <ul className="mt-3 space-y-3">
          {review.findings.map((f) => (
            <li key={f.title} className="text-sm">
              <p className="font-semibold">
                <span className={"mr-2 text-xs font-bold uppercase " + (f.severity === "high" ? "text-danger" : "text-warn")}>{f.severity}</span>
                {f.title}
              </p>
              <p className="mt-1 leading-relaxed text-muted">{f.detail}</p>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function Downloads({ runId, result }: { runId: string; result: Result }) {
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const a = result.artifacts;
  if (!a) return null;

  async function get(kind: "model" | "code" | "report") {
    setBusy(kind);
    setError(null);
    try {
      await downloadFile(runId, kind);
    } catch (e) {
      setError(e instanceof Error ? e.message : "The download failed.");
    } finally {
      setBusy(null);
    }
  }

  const btn = "rounded-lg border border-line bg-paper px-4 py-2 text-sm font-semibold text-ink transition-colors hover:border-accent hover:text-accent disabled:opacity-60";
  return (
    <section className="rounded-xl border border-line bg-surface p-4 sm:p-5">
      <h3 className="font-bold">Take it with you</h3>
      <div className="mt-3 flex flex-wrap gap-3">
        {a.model && <button className={btn} disabled={busy !== null} onClick={() => get("model")}>{busy === "model" ? "Downloading" : "Model (.joblib)"}</button>}
        {a.code && <button className={btn} disabled={busy !== null} onClick={() => get("code")}>{busy === "code" ? "Downloading" : "Training script (.py)"}</button>}
        {a.report && <button className={btn} disabled={busy !== null} onClick={() => get("report")}>{busy === "report" ? "Downloading" : "Report (.md)"}</button>}
      </div>
      {error && <p role="alert" className="mt-3 text-sm font-medium text-danger">{error}</p>}
      {!a.model && <p className="mt-3 text-sm text-muted">No model file was saved because no model clearly beat the baseline.</p>}
      {a.model && <p className="mt-3 text-xs text-muted">The saved model is refit on every cleaned row. Scores above come from the train and test split.</p>}
    </section>
  );
}

export default function Results({ result, steps, runId, onReset }: { result: Result; steps: Step[]; runId: string; onReset: () => void }) {
  const rec = result.recommendation;
  const ok = rec.verdict === "ok";
  return (
    <div className="space-y-6">
      <section className={"rounded-2xl p-5 sm:p-6 " + (ok ? "bg-accent text-white" : "bg-[#FFF6E5] text-warn")}>
        <p className="text-sm font-semibold opacity-80">{ok ? "Recommendation" : "No reliable model found"}</p>
        <h2 className="mt-1 text-2xl font-extrabold sm:text-3xl">{ok ? rec.model : "The baseline is as good as any model"}</h2>
        <p className="mt-3 max-w-2xl text-base leading-relaxed">{rec.explanation ?? rec.reason}</p>
        {rec.explanation && <p className="mt-3 text-xs opacity-75">Explained by an AI agent using only the measured results. The ranking and recommendation come from the tested code.</p>}
      </section>

      {result.review && <ReviewCard review={result.review} />}

      <section>
        <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
          <div>
            <h2 className="text-lg font-bold">Model comparison</h2>
            <p className="text-sm text-muted">
              Predicting <span className="font-semibold text-ink">{result.target}</span> ({result.task}). Ranked by cross-validated {result.primary_metric}, {result.split.cv_folds} folds.
            </p>
          </div>
          <button onClick={onReset} className="text-sm font-semibold text-accent hover:underline">Try another file</button>
        </div>
        <Leaderboard result={result} />
      </section>

      <section className="grid gap-4 sm:grid-cols-2">
        <div className="rounded-xl border border-line bg-surface p-4 sm:p-5">
          <h3 className="font-bold">Data used</h3>
          <p className="mt-2 text-sm text-muted">
            {result.n_rows.toLocaleString()} rows after cleaning, {result.n_features} feature columns. {result.split.train.toLocaleString()} rows to train and {result.split.test.toLocaleString()} held back for the final test.
          </p>
        </div>
        <div className="rounded-xl border border-line bg-surface p-4 sm:p-5">
          <h3 className="font-bold">Columns left out</h3>
          {result.dropped_columns.length === 0 ? (
            <p className="mt-2 text-sm text-muted">Every column was used.</p>
          ) : (
            <ul className="mt-2 space-y-1 text-sm text-muted">
              {result.dropped_columns.map((d) => (
                <li key={d.column}><span className="font-semibold text-ink">{d.column}</span>: {d.reason}</li>
              ))}
            </ul>
          )}
        </div>
      </section>

      {result.plan && (
        <section className="rounded-xl border border-line bg-surface p-4 sm:p-5">
          <h3 className="font-bold">The plan the team followed</h3>
          <p className="mt-2 text-sm leading-relaxed text-muted">{result.plan.rationale}</p>
          <p className="mt-2 text-xs text-muted">
            {result.plan.source === "ai" ? "Planned by an AI agent and checked by code." : "Built-in rules (no AI)."}
            {result.plan.target_transform === "log" ? " Target modelled on a log scale." : ""}
          </p>
        </section>
      )}

      <Downloads runId={runId} result={result} />

      {steps.length > 0 && (
        <details className="rounded-xl border border-line bg-surface p-4 sm:p-5">
          <summary className="cursor-pointer font-bold">How the team got here</summary>
          <div className="mt-4"><Timeline steps={steps} /></div>
        </details>
      )}

      {result.warnings.length > 0 && (
        <ul className="space-y-1.5 rounded-xl bg-[#FFF6E5] p-4 text-sm text-warn">
          {result.warnings.map((w) => <li key={w}>{w}</li>)}
        </ul>
      )}
    </div>
  );
}
