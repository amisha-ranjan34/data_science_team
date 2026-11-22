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
      <section className="rounded-2xl border border-line bg-surface p-5 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold">{run.filename}</h2>
            <p className="mt-1 text-sm text-muted">
              {profile.rows.toLocaleString()} rows, {profile.columns_count} columns, {profile.duplicates} duplicate rows
            </p>
          </div>
          <button onClick={onReset} className="text-sm font-semibold text-accent hover:underline">
            Upload a different file
          </button>
        </div>

        {profile.warnings.length > 0 && (
          <ul className="mt-4 space-y-1.5 rounded-lg bg-[#FFF6E5] p-3 text-sm text-warn">
            {profile.warnings.map((w) => <li key={w}>{w}</li>)}
          </ul>
        )}
      </section>

      <section className="rounded-2xl border border-line bg-surface p-5 sm:p-6">
        <h2 className="text-lg font-bold">What should the models predict?</h2>
        <div className="mt-4 grid gap-5 sm:grid-cols-2">
          <label className="block text-sm font-semibold">
            Target column
            <select
              value={target}
              onChange={(e) => setTarget(e.target.value)}
              className="mt-2 w-full rounded-lg border border-line bg-surface px-3 py-2.5 text-base font-normal text-ink"
            >
              {profile.columns.map((c) => <option key={c.name} value={c.name}>{c.name}</option>)}
            </select>
            {target === profile.suggested_target && <span className="mt-1.5 block text-xs font-normal text-muted">Suggested from the column names.</span>}
          </label>
          <fieldset>
            <legend className="text-sm font-semibold">Problem type</legend>
            <div className="mt-2 grid grid-cols-2 gap-1 rounded-lg border border-line bg-paper p-1">
              {(["regression", "classification"] as Task[]).map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setTask(t)}
                  aria-pressed={task === t}
                  className={"rounded-md px-3 py-2 text-sm font-semibold capitalize transition-colors " + (task === t ? "bg-accent text-white" : "text-muted hover:text-ink")}
                >
                  {t}
                </button>
              ))}
            </div>
            <span className="mt-1.5 block text-xs text-muted">
              {task === "regression" ? "Predicts a number, such as a price." : "Predicts a category, such as yes or no."}
            </span>
          </fieldset>
        </div>

        <button
          onClick={() => setShowColumns((v) => !v)}
          className="mt-6 text-sm font-semibold text-accent hover:underline"
          aria-expanded={showColumns}
        >
          {showColumns ? "Hide columns" : "Show all columns"}
        </button>
        {showColumns && (
          <div className="mt-3 overflow-x-auto rounded-lg border border-line">
            <table className="w-full min-w-[520px] text-left text-sm">
              <thead className="bg-paper text-muted">
                <tr>
                  <th className="px-3 py-2 font-semibold">Column</th>
                  <th className="px-3 py-2 font-semibold">Type</th>
                  <th className="px-3 py-2 font-semibold">Missing</th>
                  <th className="px-3 py-2 font-semibold">Unique</th>
                  <th className="px-3 py-2 font-semibold">Examples</th>
                </tr>
              </thead>
              <tbody>
                {profile.columns.map((c) => (
                  <tr key={c.name} className="border-t border-line">
                    <td className="px-3 py-2 font-medium">{c.name}{c.looks_like_id && <span className="ml-2 text-xs text-warn">looks like an ID</span>}</td>
                    <td className="px-3 py-2 text-muted">{c.kind}</td>
                    <td className="px-3 py-2">{c.missing_pct}%</td>
                    <td className="px-3 py-2">{c.unique.toLocaleString()}</td>
                    <td className="max-w-[16rem] truncate px-3 py-2 text-muted">{c.sample.join(", ")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div className="mt-6 flex flex-wrap items-center justify-between gap-4">
          {ai && (
            <p className="max-w-md text-sm text-muted">
              <span className={"mr-2 inline-block h-2 w-2 rounded-full " + (ai.enabled ? "bg-good" : "bg-[#C9D2D9]")} aria-hidden />
              {ai.enabled
                ? `AI agents on (${ai.provider}, ${ai.model}).`
                : "AI agents off. The team will use built-in rules. Add an API key in backend/.env to switch them on."}
            </p>
          )}
          <button
            onClick={() => onTrain(target, task)}
            disabled={busy}
            className="w-full rounded-lg bg-accent px-6 py-3 text-base font-semibold text-white transition-colors hover:bg-accent-dark disabled:opacity-60 sm:w-auto"
          >
            Train and compare models
          </button>
        </div>
      </section>
    </div>
  );
}
