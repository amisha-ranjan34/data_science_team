"use client";
import { useEffect, useState } from "react";
import ConfigPanel from "@/components/ConfigPanel";
import Dropzone from "@/components/Dropzone";
import Footer from "@/components/Footer";
import Progress from "@/components/Progress";
import Results from "@/components/Results";
import Stepper from "@/components/Stepper";
import { createRunFromUrl, getConfig, getRun, startTraining, uploadCsv } from "@/lib/api";
import type { AiInfo, Run, Task } from "@/lib/types";

const message = (e: unknown) => (e instanceof Error ? e.message : "Something went wrong.");

export default function Home() {
  const [run, setRun] = useState<Run | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ai, setAi] = useState<AiInfo | null>(null);

  useEffect(() => {
    getConfig().then((c) => setAi(c.ai)).catch(() => setAi(null));
  }, []);

  const runId = run?.id;
  const running = run?.status === "running";

  useEffect(() => {
    if (!runId || !running) return;
    const timer = setInterval(async () => {
      try {
        setRun(await getRun(runId));
      } catch (e) {
        setError(message(e));
      }
    }, 1000);
    return () => clearInterval(timer);
  }, [runId, running]);

  const reset = () => {
    setRun(null);
    setError(null);
  };

  async function handleFile(file: File) {
    setBusy(true);
    setError(null);
    try {
      setRun(await uploadCsv(file));
    } catch (e) {
      setError(message(e));
    } finally {
      setBusy(false);
    }
  }

  async function handleUrl(url: string) {
    setBusy(true);
    setError(null);
    try {
      setRun(await createRunFromUrl(url));
    } catch (e) {
      setError(message(e));
    } finally {
      setBusy(false);
    }
  }

  async function handleTrain(target: string, task: Task) {
    if (!run) return;
    setBusy(true);
    setError(null);
    try {
      await startTraining(run.id, target, task);
      setRun({ ...run, status: "running", progress: 0, message: "Starting training engine...", result: null, error: null, steps: [] });
    } catch (e) {
      setError(message(e));
    } finally {
      setBusy(false);
    }
  }

  const step = !run ? 0 : run.status === "profiled" || run.status === "error" ? 1 : 2;

  return (
    <div className="flex min-h-screen flex-col bg-paper text-ink">
      {/* Header */}
      <header className="border-b border-line/80 bg-surface/50 backdrop-blur-md sticky top-0 z-30 transition-colors">
        <div className="mx-auto flex max-w-4xl flex-wrap items-center justify-between gap-4 px-4 py-4 sm:px-6">
          <div className="flex items-center gap-3">
            <button onClick={reset} className="flex items-center gap-2.5 text-left group">
              <div className="grid h-9 w-9 place-items-center rounded-xl bg-gradient-to-tr from-cyan-500 to-indigo-600 text-white shadow-glow transition-transform group-hover:scale-105">
                <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4">
                  <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" />
                </svg>
              </div>
              <div>
                <p className="text-base font-black tracking-tight text-white group-hover:text-cyan-400 transition-colors">
                  Auto<span className="text-cyan-400">DS</span> Team
                </p>
                <p className="text-[10px] text-muted">Auto Data Science Team</p>
              </div>
            </button>
          </div>

          <div className="flex items-center gap-3">
            <Stepper current={step} />
            {run && (
              <button
                onClick={reset}
                className="hidden sm:inline-flex items-center gap-1.5 rounded-lg border border-line bg-surface-elevated px-2.5 py-1 text-xs font-semibold text-slate-300 hover:text-white hover:border-cyan-500/40 transition-colors"
              >
                Reset
              </button>
            )}
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="mx-auto w-full max-w-4xl flex-1 px-4 py-8 sm:px-6 space-y-6">
        {!run && (
          <div className="space-y-6">
            <div className="text-center max-w-xl mx-auto space-y-3 pt-4 sm:pt-6">
              <div className="inline-flex items-center gap-2 rounded-full border border-cyan-500/30 bg-cyan-950/20 px-3 py-1 text-xs font-semibold text-cyan-300">
                <span className="h-2 w-2 rounded-full bg-cyan-400 animate-pulse" />
                Autonomous Data Science Team
              </div>
              <h1 className="text-3xl font-black tracking-tight text-white sm:text-4xl">
                Upload a CSV.{" "}
                <span className="bg-gradient-to-r from-cyan-400 via-sky-300 to-indigo-400 bg-clip-text text-transparent">
                  Get the right model.
                </span>
              </h1>
              <p className="text-sm text-slate-300">
                The team cleans your data, trains several models, tests them fairly and tells you which one to use and why.
              </p>
            </div>

            <Dropzone onFile={handleFile} onUrl={handleUrl} busy={busy} />
          </div>
        )}

        {run && (run.status === "profiled" || run.status === "error") && (
          <ConfigPanel run={run} busy={busy} onTrain={handleTrain} onReset={reset} ai={ai} />
        )}

        {run?.status === "running" && <Progress value={run.progress} message={run.message} steps={run.steps} />}

        {run?.status === "done" && run.result && <Results result={run.result} steps={run.steps} onReset={reset} />}

        {(error || run?.error) && (
          <div
            role="alert"
            className="rounded-xl border border-red-500/40 bg-red-950/50 p-4 text-xs font-medium text-red-200 flex flex-wrap items-center justify-between gap-3 shadow-md"
          >
            <div className="flex items-center gap-2">
              <svg className="h-4 w-4 text-red-400 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="10" />
                <line x1="12" y1="8" x2="12" y2="12" />
                <line x1="12" y1="16" x2="12.01" y2="16" />
              </svg>
              <span>{error ?? run?.error}</span>
            </div>
            <button
              onClick={reset}
              className="rounded-lg bg-red-900/60 hover:bg-red-800 border border-red-500/40 px-3 py-1.5 text-xs font-bold text-red-100 transition-colors"
            >
              Start Over / Re-upload
            </button>
          </div>
        )}
      </main>

      <Footer />
    </div>
  );
}
