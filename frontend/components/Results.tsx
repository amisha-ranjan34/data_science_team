"use client";

import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import {
  ArrowRight,
  Check,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Download,
  Layers3,
  Lightbulb,
  ShieldCheck,
  Sparkles,
  X,
} from "lucide-react";
import { AnimatePresence, motion, useReducedMotion, useSpring, useTransform } from "framer-motion";
import { downloadFile, startWhatIf } from "@/lib/api";
import type { ModelResult, RedTeam, Result, Review, Run, Step } from "@/lib/types";
import Timeline from "./Timeline";

const METRIC_LABELS: Record<string, string> = {
  r2: "R²",
  rmse: "RMSE",
  mae: "MAE",
  accuracy: "Accuracy",
  f1_macro: "Macro F1",
  roc_auc: "ROC AUC",
};

function fmt(key: string, value: number) {
  if (key === "rmse" || key === "mae") return Math.round(value).toLocaleString();
  return value.toFixed(3);
}

function CountUp({ value, metric }: { value: number | null; metric: string }) {
  const spring = useSpring(value ?? 0, { stiffness: 78, damping: 20 });
  const text = useTransform(spring, (current) => fmt(metric, current));
  useEffect(() => {
    spring.set(value ?? 0);
  }, [spring, value]);
  return value === null ? <span>—</span> : <motion.span>{text}</motion.span>;
}

function MetricCard({
  label,
  value,
  metric,
  note,
  index,
}: {
  label: string;
  value: number | null;
  metric: string;
  note?: string;
  index: number;
}) {
  const reduceMotion = useReducedMotion();
  return (
    <motion.article
      className="result-metric-card"
      initial={reduceMotion ? false : { opacity: 0, y: 18 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.25 }}
      transition={{ duration: reduceMotion ? 0 : 0.45, delay: reduceMotion ? 0 : index * 0.07 }}
    >
      <p className="result-eyebrow">{label}</p>
      <p className="result-metric-value"><CountUp value={value} metric={metric} /></p>
      <p className="result-metric-note">{note ?? (value === null ? "Not returned by the API" : "Held-out test set")}</p>
    </motion.article>
  );
}

function PlotSkeleton() {
  return <div className="plot-skeleton" aria-label="Loading chart" role="status"><span /></div>;
}

function LazyPlot({ children }: { children: ReactNode }) {
  const [visible, setVisible] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const element = containerRef.current;
    if (!element) return;
    if (!("IntersectionObserver" in window)) {
      setVisible(true);
      return;
    }
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) {
        setVisible(true);
        observer.disconnect();
      }
    }, { rootMargin: "120px" });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  return <div ref={containerRef} className="result-plot-area">{visible ? children : <PlotSkeleton />}</div>;
}

function ScoreChart({ result }: { result: Result }) {
  const rows = [...result.models].sort((a, b) => b.cv_mean - a.cv_mean);
  const scores = rows.flatMap((model) => [
    model.cv_mean,
    ...(Number.isFinite(model.test[result.primary_metric]) ? [model.test[result.primary_metric]] : []),
  ]);
  const min = Math.min(0, ...scores);
  const max = Math.max(...scores, min + 1);
  const width = (value: number) => `${Math.max(1, ((value - min) / (max - min)) * 100)}%`;

  return (
    <div className="plot-rows" aria-label={`Cross-validation and test ${result.primary_metric} comparison`}>
      <div className="plot-legend"><span><i className="legend-cv" /> Cross-validation</span><span><i className="legend-test" /> Test set</span></div>
      {rows.map((model) => {
        const testScore = model.test[result.primary_metric];
        return (
          <div className="plot-row" key={model.name}>
            <div className="plot-row-heading"><span>{model.name}{model.tuned ? " · tuned" : ""}</span><strong>{fmt(result.primary_metric, model.cv_mean)}</strong></div>
            <div className="plot-track">
              <span className="plot-bar-cv" style={{ width: width(model.cv_mean) }} />
              {Number.isFinite(testScore) && <span className="plot-marker-test" style={{ left: width(testScore) }} title={`Test: ${fmt(result.primary_metric, testScore)}`} />}
            </div>
            <p className="plot-row-foot">CV {fmt(result.primary_metric, model.cv_mean)} ± {fmt(result.primary_metric, model.cv_std)}{Number.isFinite(testScore) ? ` · Test ${fmt(result.primary_metric, testScore)}` : ""}</p>
          </div>
        );
      })}
    </div>
  );
}

function TrainingTimeChart({ models }: { models: ModelResult[] }) {
  const longest = Math.max(0.01, ...models.map((model) => model.seconds));
  return (
    <div className="plot-rows" aria-label="Model training time comparison">
      {models.map((model) => (
        <div className="plot-row" key={model.name}>
          <div className="plot-row-heading"><span>{model.name}</span><strong>{model.seconds.toFixed(2)}s</strong></div>
          <div className="plot-track"><span className="plot-bar-time" style={{ width: `${Math.max(1, (model.seconds / longest) * 100)}%` }} /></div>
        </div>
      ))}
    </div>
  );
}

function Leaderboard({ result }: { result: Result }) {
  const sorted = [...result.models].sort((a, b) => b.cv_mean - a.cv_mean);
  return (
    <div className="leaderboard">
      {sorted.map((model, index) => {
        const recommended = model.name === result.recommendation.model;
        return (
          <article className={`leaderboard-row ${recommended ? "is-recommended" : ""}`} key={model.name}>
            <span className="leaderboard-rank">{String(index + 1).padStart(2, "0")}</span>
            <div className="leaderboard-main">
              <div className="leaderboard-title">
                <h3>{model.name}</h3>
                {recommended && <span className="result-tag">Recommended</span>}
                {model.tuned && <span className="result-tag result-tag-muted">Tuned</span>}
              </div>
              <p>{result.primary_metric} {fmt(result.primary_metric, model.cv_mean)} ± {fmt(result.primary_metric, model.cv_std)}</p>
              {model.tuned && model.params && <p className="leaderboard-params">Settings: {Object.entries(model.params).map(([key, value]) => `${key}=${value}`).join(", ")}</p>}
              <dl className="leaderboard-metrics">
                {Object.entries(model.test).map(([key, value]) => (
                  <div key={key}><dt>Test {METRIC_LABELS[key] ?? key}</dt><dd>{fmt(key, value)}</dd></div>
                ))}
                <div><dt>Train time</dt><dd>{model.seconds.toFixed(2)}s</dd></div>
              </dl>
            </div>
          </article>
        );
      })}
      <p className="leaderboard-note">Scores use {result.split.cv_folds}-fold cross-validation. Test-set metrics are shown separately to help spot overfitting.</p>
    </div>
  );
}

const VERDICT: Record<Review["verdict"], { label: string; tone: string }> = {
  pass: { label: "Passed", tone: "good" },
  caution: { label: "Caution", tone: "warn" },
  fail: { label: "Needs attention", tone: "bad" },
};

function ReviewPanel({ review }: { review: Review }) {
  const verdict = VERDICT[review.verdict];
  return (
    <div className="insight-content">
      <div className="insight-heading"><ShieldCheck size={20} /><span className={`result-tag result-tag-${verdict.tone}`}>{verdict.label}</span></div>
      {review.findings.length === 0 ? (
        <p>No issues found. Checks run: {review.checks.join(", ").toLowerCase()}.</p>
      ) : (
        <ul className="insight-list">
          {review.findings.map((finding) => (
            <li key={finding.title}>
              <div><span className={`severity severity-${finding.severity}`}>{finding.severity}</span><strong>{finding.title}</strong></div>
              <p>{finding.detail}</p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

const RED_VERDICT: Record<RedTeam["verdict"], { label: string; tone: string }> = {
  pass: { label: "Survived", tone: "good" },
  caution: { label: "Some weak spots", tone: "warn" },
  fail: { label: "Broke under stress", tone: "bad" },
};

function RedTeamPanel({ red }: { red: RedTeam | null }) {
  if (!red) return <div className="insight-content"><p>No red-team stress-test results are available for this run.</p></div>;
  const verdict = RED_VERDICT[red.verdict];
  return (
    <div className="insight-content">
      <div className="insight-heading"><Sparkles size={20} /><span className={`result-tag result-tag-${verdict.tone}`}>{verdict.label}</span></div>
      <p>Baseline {red.metric}: <strong>{red.baseline_score.toFixed(3)}</strong></p>
      <ul className="insight-list">
        {red.attacks.map((attack) => (
          <li key={attack.name}>
            <div><span className={`severity severity-${attack.severity}`}>{attack.severity === "pass" ? "held up" : attack.severity === "medium" ? "weak spot" : "broke"}</span><strong>{attack.name}</strong></div>
            <p>{attack.what}</p>
            <p>{attack.result}</p>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Downloads({ runId, result }: { runId: string; result: Result }) {
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const artifacts = result.artifacts;

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

  if (!artifacts) return null;
  return (
    <div className="result-download-list">
      {artifacts.report && <button onClick={() => get("report")} disabled={busy !== null}><Download size={16} />{busy === "report" ? "Preparing report..." : "Download report"}<ArrowRight size={16} /></button>}
      {artifacts.model && <button onClick={() => get("model")} disabled={busy !== null}><Download size={16} />{busy === "model" ? "Preparing model..." : "Download model (.joblib)"}<ArrowRight size={16} /></button>}
      {artifacts.code && <button onClick={() => get("code")} disabled={busy !== null}><Download size={16} />{busy === "code" ? "Preparing script..." : "Download training script"}<ArrowRight size={16} /></button>}
      {error && <p role="alert">{error}</p>}
    </div>
  );
}

function WhatIfPanel({ runId, onStarted }: { runId: string; onStarted: (run: Run) => void }) {
  const [question, setQuestion] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      onStarted(await startWhatIf(runId, question.trim()));
    } catch (e) {
      setError(e instanceof Error ? e.message : "The what-if analysis could not be started.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="result-panel what-if-panel">
      <div className="result-panel-heading"><div><p className="result-eyebrow">Explore a scenario</p><h3>What if you changed a feature?</h3></div><Lightbulb size={20} /></div>
      <p>Ask what changes if you remove one or more feature columns. The original profile is reused; training and review run again. With AI enabled, your question and column names are sent to the configured provider, never raw rows.</p>
      <form onSubmit={submit} className="what-if-form">
        <input required minLength={8} maxLength={500} value={question} onChange={(event) => setQuestion(event.target.value)} placeholder='For example: "What if I drop the city column?"' aria-label="What-if question" />
        <button type="submit" disabled={busy}>{busy ? "Starting..." : "Run scenario"}<ArrowRight size={16} /></button>
      </form>
      {error && <p role="alert" className="result-error">{error}</p>}
    </section>
  );
}

function ChartModal({ activeIndex, setActiveIndex, close, result }: { activeIndex: number | null; setActiveIndex: (index: number | null) => void; close: () => void; result: Result }) {
  const reduceMotion = useReducedMotion();
  const charts = [
    { title: `Model performance · ${METRIC_LABELS[result.primary_metric] ?? result.primary_metric}`, content: <ScoreChart result={result} /> },
    { title: "Training time by model", content: <TrainingTimeChart models={result.models} /> },
  ];

  useEffect(() => {
    if (activeIndex === null) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") close();
      if (event.key === "ArrowRight") setActiveIndex((activeIndex + 1) % charts.length);
      if (event.key === "ArrowLeft") setActiveIndex((activeIndex - 1 + charts.length) % charts.length);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [activeIndex, charts.length, close, setActiveIndex]);

  return (
    <AnimatePresence>
      {activeIndex !== null && (
        <motion.div className="chart-lightbox" role="dialog" aria-modal="true" aria-label={charts[activeIndex].title} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: reduceMotion ? 0 : 0.2 }} onMouseDown={(event) => { if (event.target === event.currentTarget) close(); }}>
          <motion.div className="chart-lightbox-panel" initial={reduceMotion ? false : { opacity: 0, y: 18, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 12, scale: 0.98 }} transition={{ duration: reduceMotion ? 0 : 0.25 }}>
            <div className="chart-lightbox-header"><div><p className="result-eyebrow">Visualization {activeIndex + 1} / {charts.length}</p><h2>{charts[activeIndex].title}</h2></div><button onClick={close} aria-label="Close chart"><X size={20} /></button></div>
            <div className="chart-lightbox-content">{charts[activeIndex].content}</div>
            <div className="chart-lightbox-controls"><button onClick={() => setActiveIndex((activeIndex - 1 + charts.length) % charts.length)} aria-label="Previous chart"><ChevronLeft size={18} />Previous</button><span>Use ← / → to browse</span><button onClick={() => setActiveIndex((activeIndex + 1) % charts.length)} aria-label="Next chart">Next<ChevronRight size={18} /></button></div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

export default function Results({
  result,
  steps,
  runId,
  onReset,
  onWhatIf,
  onOpenRun,
}: {
  result: Result;
  steps: Step[];
  runId: string;
  onReset: () => void;
  onWhatIf: (run: Run) => void;
  onOpenRun: (id: string) => void;
}) {
  const reduceMotion = useReducedMotion();
  const [insightTab, setInsightTab] = useState<"advisor" | "reviewer" | "red-team">("advisor");
  const [activeChart, setActiveChart] = useState<number | null>(null);
  const [downloadError, setDownloadError] = useState<string | null>(null);
  const [reportBusy, setReportBusy] = useState(false);
  const recommendation = result.recommendation;
  const selected = result.models.find((model) => model.name === recommendation.model) ?? result.models[0];
  const whatIf = result.what_if;
  const testMetric = selected?.test[result.primary_metric];
  const heroScore = Number.isFinite(testMetric) ? testMetric : selected?.cv_mean ?? null;
  const isClassification = result.task === "classification";
  const metrics = isClassification
    ? [
        { label: "Accuracy", key: "accuracy", value: selected?.test.accuracy ?? null },
        { label: "Precision", key: "precision", value: null },
        { label: "Recall", key: "recall", value: null },
        { label: "Macro F1", key: "f1_macro", value: selected?.test.f1_macro ?? null },
        { label: "ROC AUC", key: "roc_auc", value: selected?.test.roc_auc ?? null },
      ]
    : [
        { label: "R²", key: "r2", value: selected?.test.r2 ?? null },
        { label: "RMSE", key: "rmse", value: selected?.test.rmse ?? null },
        { label: "MAE", key: "mae", value: selected?.test.mae ?? null },
      ];

  async function downloadReport() {
    setReportBusy(true);
    setDownloadError(null);
    try {
      await downloadFile(runId, "report");
    } catch (e) {
      setDownloadError(e instanceof Error ? e.message : "The report download failed.");
    } finally {
      setReportBusy(false);
    }
  }

  const openChart = (index: number) => setActiveChart(index);
  const advisorContent = recommendation.explanation ?? recommendation.reason;
  const verdict = recommendation.verdict === "ok" ? "Recommended" : "No clear winner";

  return (
    <div className="results-page">
      <section className="results-hero">
        <div className="results-hero-copy">
          <p className="result-eyebrow"><span className="result-live-dot" /> Experiment complete · {result.task}</p>
          <h1>{recommendation.model ? <>Your next move: <span>{recommendation.model}</span></> : "The baseline holds."}</h1>
          <p className="results-hero-description">{recommendation.explanation ?? recommendation.reason}</p>
          <div className="results-hero-actions">
            {result.artifacts?.report ? (
              <button onClick={downloadReport} disabled={reportBusy} className="result-button result-button-primary"><Download size={17} />{reportBusy ? "Preparing report..." : "Download report"}</button>
            ) : (
              <span className="report-unavailable">Report file not available for this run</span>
            )}
            <button onClick={onReset} className="result-button result-button-secondary">New experiment<ArrowRight size={17} /></button>
          </div>
          {downloadError && <p role="alert" className="result-error">{downloadError}</p>}
        </div>
        <div className="results-hero-score">
          <span>{METRIC_LABELS[result.primary_metric] ?? result.primary_metric} · {Number.isFinite(testMetric) ? "test score" : "cross-validation"}</span>
          <strong><CountUp value={heroScore} metric={result.primary_metric} /></strong>
          <small>{verdict}</small>
        </div>
      </section>

      <section className={`result-metrics-grid ${isClassification ? "is-classification" : ""}`} aria-label="Experiment metrics">
        {metrics.map((metric, index) => (
          <MetricCard key={metric.label} label={metric.label} value={metric.value} metric={metric.key} index={index} note={metric.value === null && ["precision", "recall"].includes(metric.key) ? "Not returned by the current API" : undefined} />
        ))}
      </section>

      <section className="result-charts-section">
        <div className="result-section-heading"><div><p className="result-eyebrow">Explore the run</p><h2>Performance, at a glance</h2><p>Charts are built from the model scores and timings returned for this experiment.</p></div><span className="result-mono-label"><Layers3 size={15} /> {result.models.length} models</span></div>
        <div className="result-chart-grid">
          {[
            { title: `Model performance · ${METRIC_LABELS[result.primary_metric] ?? result.primary_metric}`, description: "Cross-validation vs held-out test score", chart: <ScoreChart result={result} /> },
            { title: "Training time by model", description: "Elapsed training time for each candidate", chart: <TrainingTimeChart models={result.models} /> },
          ].map((chart, index) => (
            <motion.article className="result-chart-card" key={chart.title} initial={reduceMotion ? false : { opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, amount: 0.18 }} transition={{ duration: reduceMotion ? 0 : 0.45, delay: reduceMotion ? 0 : index * 0.1 }}>
              <button className="result-chart-open" onClick={() => openChart(index)} aria-label={`Open ${chart.title} full size`}>
                <div className="result-chart-heading"><div><h3>{chart.title}</h3><p>{chart.description}</p></div><span><ArrowRight size={17} /></span></div>
                <LazyPlot>{chart.chart}</LazyPlot>
                <span className="chart-open-hint">Click to expand</span>
              </button>
            </motion.article>
          ))}
        </div>
        <p className="plot-availability-note">No image-based plots (such as confusion matrices or ROC curves) were included in the current results API; these visualizations use the metrics and training times it does provide.</p>
      </section>

      <section className="result-insights-section">
        <div className="result-section-heading"><div><p className="result-eyebrow">Team verdicts</p><h2>What the specialists found</h2></div></div>
        <div className="result-insights-card">
          <div className="result-tabs" role="tablist" aria-label="Team findings">
            <button role="tab" aria-selected={insightTab === "advisor"} onClick={() => setInsightTab("advisor")}><Lightbulb size={16} />Advisor</button>
            <button role="tab" aria-selected={insightTab === "reviewer"} onClick={() => setInsightTab("reviewer")}><ShieldCheck size={16} />Reviewer</button>
            <button role="tab" aria-selected={insightTab === "red-team"} onClick={() => setInsightTab("red-team")}><Sparkles size={16} />Red team</button>
          </div>
          <div className="result-tab-panel" role="tabpanel">
            {insightTab === "advisor" && <div className="insight-content"><div className="insight-heading"><Lightbulb size={20} /><span className={`result-tag result-tag-${recommendation.verdict === "ok" ? "good" : "warn"}`}>{verdict}</span></div><p>{advisorContent}</p></div>}
            {insightTab === "reviewer" && (result.review ? <ReviewPanel review={result.review} /> : <div className="insight-content"><p>No reviewer findings were included for this run.</p></div>)}
            {insightTab === "red-team" && <RedTeamPanel red={result.redteam ?? null} />}
          </div>
        </div>
      </section>

      {whatIf && (
        <section className="result-panel scenario-panel">
          <p className="result-eyebrow">Scenario comparison</p>
          <h3>What-if result</h3>
          <p>{whatIf.question}</p>
          <div className="scenario-summary"><span>Original: <strong>{whatIf.baseline_model ?? "No model"}</strong>{whatIf.baseline_cv_mean !== null && ` · ${fmt(whatIf.baseline_metric, whatIf.baseline_cv_mean)} ${whatIf.baseline_metric}`}</span><span>Scenario: <strong>{recommendation.model ?? "No model"}</strong>{selected && ` · ${fmt(result.primary_metric, selected.cv_mean)} ${result.primary_metric}`}</span></div>
          <button onClick={() => onOpenRun(whatIf.parent_run_id)} className="result-text-link">Open the original experiment<ArrowRight size={15} /></button>
        </section>
      )}

      <section className="result-panel result-models-panel">
        <div className="result-section-heading"><div><p className="result-eyebrow">Model comparison</p><h2>All candidates</h2><p>Predicting <strong>{result.target}</strong>, ranked by cross-validated {METRIC_LABELS[result.primary_metric] ?? result.primary_metric} over {result.split.cv_folds} folds.</p></div></div>
        <Leaderboard result={result} />
      </section>

      <section className="result-detail-grid">
        <article className="result-panel"><p className="result-eyebrow">Data used</p><h3>{result.n_rows.toLocaleString()} rows</h3><p>{result.n_features} feature columns. {result.split.train.toLocaleString()} rows for training and {result.split.test.toLocaleString()} held back for the final test.</p></article>
        <article className="result-panel"><p className="result-eyebrow">Columns left out</p>{result.dropped_columns.length === 0 ? <p>Every column was used.</p> : <ul>{result.dropped_columns.map((item) => <li key={item.column}><strong>{item.column}</strong>: {item.reason}</li>)}</ul>}</article>
      </section>

      {result.plan && (
        <section className="result-panel result-plan-panel">
          <p className="result-eyebrow">The plan</p><h3>{result.plan.rationale}</h3>
          <p>{result.plan.source === "ai" ? "Planned by an AI agent and checked by code." : result.plan.source === "what-if" ? "Scenario based on the original experiment plan." : "Built-in rules (no AI)."}{result.plan.target_transform === "log" ? " Target modelled on a log scale." : ""}</p>
        </section>
      )}

      {result.warnings.length > 0 && <ul className="result-warnings">{result.warnings.map((warning) => <li key={warning}>{warning}</li>)}</ul>}

      <div className="result-bottom-actions">
        <Downloads runId={runId} result={result} />
        <button onClick={onReset} className="result-button result-button-primary">New experiment<ArrowRight size={17} /></button>
      </div>

      <WhatIfPanel runId={runId} onStarted={onWhatIf} />
      {steps.length > 0 && <details className="result-timeline"><summary>How the team got here</summary><div><Timeline steps={steps} /></div></details>}
      <ChartModal activeIndex={activeChart} setActiveIndex={setActiveChart} close={() => setActiveChart(null)} result={result} />
    </div>
  );
}
