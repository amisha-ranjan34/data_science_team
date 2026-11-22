"use client";
import { useState } from "react";
import type { AiInfo, Run, Task } from "@/lib/types";

interface Props {
  run: Run;
  busy: boolean;
  onTrain: (target: string, task: Task) => void;
  onReset: () => void;
  ai: AiInfo | null;
}

export default function ConfigPanel({ run, busy, onTrain, onReset, ai }: Props) {
  const { profile } = run;
  const [target, setTarget] = useState(profile.suggested_target);
  const [task, setTask] = useState<Task>(profile.suggested_task);
  const [showColumns, setShowColumns] = useState(false);

  return (
    <div className="space-y-6">
      {/* File & Profile Summary Card */}
      <section className="rounded-2xl border border-line bg-surface/80 p-5 sm:p-6 backdrop-blur-sm shadow-glow-card">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="space-y-1.5">
            <div className="flex items-center gap-2.5">
              <span className="grid h-8 w-8 place-items-center rounded-lg bg-cyan-500/10 border border-cyan-500/30 text-cyan-400">
                <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                  <polyline points="14 2 14 8 20 8" />
                </svg>
              </span>
              <h2 className="text-lg font-bold text-white break-all">{run.filename}</h2>
            </div>
            <p className="text-xs text-slate-300 font-mono">
              {profile.rows.toLocaleString()} rows, {profile.columns_count} columns, {profile.duplicates} duplicate rows
            </p>
          </div>

          <button
            onClick={onReset}
            className="inline-flex items-center gap-1.5 rounded-lg border border-line bg-surface-elevated px-3 py-1.5 text-xs font-semibold text-cyan-400 hover:text-cyan-300 hover:border-cyan-500/40 hover:bg-surface-hover transition-colors"
          >
            <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M19 12H5M12 19l-7-7 7-7" />
            </svg>
            Upload a different file
          </button>
        </div>

        {profile.warnings.length > 0 && (
          <div className="mt-4 rounded-xl border border-amber-500/30 bg-amber-500/10 p-3.5 text-xs text-amber-200 space-y-1">
            <p className="font-semibold flex items-center gap-1.5 text-amber-300">
              <svg className="h-4 w-4 text-amber-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="10" />
                <line x1="12" y1="8" x2="12" y2="12" />
                <line x1="12" y1="16" x2="12.01" y2="16" />
              </svg>
              Dataset Observations
            </p>
            <ul className="list-inside list-disc pl-1 space-y-0.5 text-amber-200">
              {profile.warnings.map((w) => (
                <li key={w}>{w}</li>
              ))}
            </ul>
          </div>
        )}
      </section>

      {/* Target & Task Configuration Card */}
      <section className="rounded-2xl border border-line bg-surface/80 p-5 sm:p-6 backdrop-blur-sm shadow-glow-card">
        <h2 className="text-lg font-bold text-white">What should the models predict?</h2>

        <div className="mt-5 grid gap-6 sm:grid-cols-2">
          {/* Target Column Selector */}
          <div>
            <label htmlFor="target-select" className="block text-sm font-semibold text-slate-200">
              Target column
            </label>
            <div className="mt-2 relative">
              <select
                id="target-select"
                value={target}
                onChange={(e) => setTarget(e.target.value)}
                className="w-full rounded-xl border border-line bg-[#0B1120] px-4 py-2.5 text-sm font-semibold text-white shadow-sm focus:border-cyan-500 focus:outline-none focus:ring-1 focus:ring-cyan-500"
              >
                {profile.columns.map((c) => (
                  <option key={c.name} value={c.name} className="bg-[#111827] text-white">
                    {c.name} ({c.kind})
                  </option>
                ))}
              </select>
            </div>
            {target === profile.suggested_target && (
              <span className="mt-1.5 block text-xs font-medium text-cyan-400">
                ★ Suggested from the column names.
              </span>
            )}
          </div>

          {/* Problem Type Toggle */}
          <div>
            <span className="block text-sm font-semibold text-slate-200">Problem type</span>
            <div className="mt-2 grid grid-cols-2 gap-1.5 rounded-xl border border-line bg-[#0B1120] p-1">
              {(["regression", "classification"] as Task[]).map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setTask(t)}
                  aria-pressed={task === t}
                  className={
                    "rounded-lg px-3 py-2 text-xs font-bold capitalize transition-all " +
                    (task === t
                      ? "bg-gradient-to-r from-cyan-500 to-blue-600 text-white shadow-glow-sm"
                      : "text-slate-400 hover:text-white hover:bg-surface-elevated")
                  }
                >
                  {t}
                </button>
              ))}
            </div>
            <span className="mt-1.5 block text-xs text-slate-400">
              {task === "regression" ? "Predicts a number, such as a price." : "Predicts a category, such as yes or no."}
            </span>
          </div>
        </div>

        {/* Columns Inspector */}
        <button
          onClick={() => setShowColumns((v) => !v)}
          className="mt-6 inline-flex items-center gap-1.5 text-xs font-semibold text-cyan-400 hover:text-cyan-300 transition-colors"
          aria-expanded={showColumns}
        >
          <svg
            className={"h-4 w-4 transition-transform " + (showColumns ? "rotate-90" : "")}
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <polyline points="9 18 15 12 9 6" />
          </svg>
          {showColumns ? "Hide columns" : `Show all columns (${profile.columns.length})`}
        </button>

        {showColumns && (
          <div className="mt-3 overflow-x-auto rounded-xl border border-line bg-[#0B1120]">
            <table className="w-full min-w-[520px] text-left text-xs">
              <thead className="bg-surface-elevated text-slate-300 border-b border-line">
                <tr>
                  <th className="px-3.5 py-2.5 font-bold">Column</th>
                  <th className="px-3.5 py-2.5 font-bold">Type</th>
                  <th className="px-3.5 py-2.5 font-bold">Missing</th>
                  <th className="px-3.5 py-2.5 font-bold">Unique</th>
                  <th className="px-3.5 py-2.5 font-bold">Examples</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line/60">
                {profile.columns.map((c) => (
                  <tr key={c.name} className="hover:bg-surface-elevated/40 transition-colors">
                    <td className="px-3.5 py-2 font-medium text-slate-100">
                      {c.name}
                      {c.looks_like_id && (
                        <span className="ml-2 rounded bg-amber-500/10 border border-amber-500/30 px-1.5 py-0.5 text-[10px] text-amber-300">
                          looks like an ID
                        </span>
                      )}
                    </td>
                    <td className="px-3.5 py-2 text-slate-400 capitalize">{c.kind}</td>
                    <td className="px-3.5 py-2 text-slate-200">{c.missing_pct}%</td>
                    <td className="px-3.5 py-2 text-slate-200">{c.unique.toLocaleString()}</td>
                    <td className="max-w-[16rem] truncate px-3.5 py-2 text-slate-400 font-mono text-[11px]">
                      {c.sample.join(", ")}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Action Row */}
        <div className="mt-8 flex flex-wrap items-center justify-between gap-4 border-t border-line/60 pt-5">
          {ai && (
            <p className="max-w-md text-xs text-slate-300 flex items-center gap-2">
              <span className={"inline-block h-2 w-2 rounded-full " + (ai.enabled ? "bg-emerald-400 animate-pulse" : "bg-slate-600")} aria-hidden />
              <span>
                {ai.enabled
                  ? `AI agents on (${ai.provider}, ${ai.model}).`
                  : "AI agents off. The team will use built-in rules. Add an API key in backend/.env to switch them on."}
              </span>
            </p>
          )}

          <button
            onClick={() => onTrain(target, task)}
            disabled={busy}
            className="w-full sm:w-auto inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 px-6 py-3 text-sm font-bold text-white shadow-glow transition-all hover:from-cyan-400 hover:to-blue-500 disabled:opacity-50"
          >
            {busy ? (
              <>
                <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                </svg>
                Training in progress...
              </>
            ) : (
              <>
                Train and compare models
                <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                  <path d="M5 12h14M12 5l7 7-7 7" />
                </svg>
              </>
            )}
          </button>
        </div>
      </section>
    </div>
  );
}
