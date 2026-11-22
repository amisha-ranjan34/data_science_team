"use client";
import { useEffect, useState } from "react";
import ConfigPanel from "@/components/ConfigPanel";
import Dropzone from "@/components/Dropzone";
import Progress from "@/components/Progress";
import Results from "@/components/Results";
import Stepper from "@/components/Stepper";
import { getConfig, getRun, startTraining, uploadCsv } from "@/lib/api";
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

  const reset = () => { setRun(null); setError(null); };

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

  async function handleTrain(target: string, task: Task) {
    if (!run) return;
    setBusy(true);
    setError(null);
    try {
      await startTraining(run.id, target, task);
      setRun({ ...run, status: "running", progress: 0, message: "Starting", result: null, error: null, steps: [] });
    } catch (e) {
      setError(message(e));
    } finally {
      setBusy(false);
    }
  }

  const step = !run ? 0 : run.status === "profiled" || run.status === "error" ? 1 : 2;

  return (
    <div className="mx-auto max-w-4xl px-4 pb-20 pt-6 sm:px-6">
      <header className="flex flex-wrap items-center justify-between gap-4 border-b border-line pb-5">
        <p className="text-lg font-extrabold tracking-tight">Auto Data Science Team</p>
        <Stepper current={step} />
      </header>

      <main className="mt-10 space-y-6">
        {!run && (
          <>
            <div className="max-w-2xl">
              <h1 className="text-3xl font-extrabold tracking-tight sm:text-4xl">Upload a CSV. Get the right model.</h1>
              <p className="mt-3 text-base leading-relaxed text-muted">
                The team cleans your data, trains several models, tests them fairly and tells you which one to use and why.
              </p>
            </div>
            <Dropzone onFile={handleFile} busy={busy} />
          </>
        )}

        {run && (run.status === "profiled" || run.status === "error") && (
          <ConfigPanel run={run} busy={busy} onTrain={handleTrain} onReset={reset} ai={ai} />
        )}
        {run?.status === "running" && <Progress value={run.progress} message={run.message} steps={run.steps} />}
        {run?.status === "done" && run.result && <Results result={run.result} steps={run.steps} runId={run.id} onReset={reset} />}

        {(error || run?.error) && (
          <p role="alert" className="rounded-xl border border-[#F4C7C3] bg-[#FDECEA] p-4 text-sm font-medium text-danger">
            {error ?? run?.error}
          </p>
        )}
      </main>
    </div>
  );
}
