"use client";
import { useCallback, useEffect, useState } from "react";
import AuthForm from "@/components/AuthForm";
import ConfigPanel from "@/components/ConfigPanel";
import Dropzone from "@/components/Dropzone";
import Progress from "@/components/Progress";
import Results from "@/components/Results";
import RunHistory from "@/components/RunHistory";
import Stepper from "@/components/Stepper";
import { AuthError, clearToken, deleteRun, getConfig, getMe, getRun, getToken, listRuns, startTraining, uploadCsv } from "@/lib/api";
import type { AiInfo, Run, RunSummary, Task, User } from "@/lib/types";

const message = (e: unknown) => (e instanceof Error ? e.message : "Something went wrong.");

export default function Home() {
  const [user, setUser] = useState<User | null>(null);
  const [checking, setChecking] = useState(true);
  const [run, setRun] = useState<Run | null>(null);
  const [history, setHistory] = useState<RunSummary[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ai, setAi] = useState<AiInfo | null>(null);

  const logout = useCallback(() => {
    clearToken();
    setUser(null);
    setRun(null);
    setHistory([]);
    setError(null);
  }, []);

  // Handles every API failure in one place: an expired login sends the user back to the form.
  const fail = useCallback((e: unknown) => (e instanceof AuthError ? logout() : setError(message(e))), [logout]);

  useEffect(() => {
    getConfig().then((c) => setAi(c.ai)).catch(() => setAi(null));
    if (!getToken()) {
      setChecking(false);
      return;
    }
    getMe().then(setUser).catch(() => clearToken()).finally(() => setChecking(false));
  }, []);

  useEffect(() => {
    if (user && !run) listRuns().then(setHistory).catch(fail);
  }, [user, run, fail]);

  const runId = run?.id;
  const running = run?.status === "running";
  useEffect(() => {
    if (!runId || !running) return;
    const timer = setInterval(() => getRun(runId).then(setRun).catch(fail), 1000);
    return () => clearInterval(timer);
  }, [runId, running, fail]);

  const reset = () => { setRun(null); setError(null); };

  async function handleFile(file: File) {
    setBusy(true);
    setError(null);
    try {
      setRun(await uploadCsv(file));
    } catch (e) {
      fail(e);
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
      fail(e);
    } finally {
      setBusy(false);
    }
  }

  async function openRun(id: string) {
    setError(null);
    try {
      setRun(await getRun(id));
    } catch (e) {
      fail(e);
    }
  }

  async function removeRun(id: string) {
    if (!window.confirm("Delete this run and its files?")) return;
    try {
      await deleteRun(id);
      setHistory((h) => h.filter((r) => r.id !== id));
    } catch (e) {
      fail(e);
    }
  }

  const step = !run ? 0 : run.status === "profiled" || run.status === "error" ? 1 : 2;

  return (
    <div className="mx-auto max-w-4xl px-4 pb-20 pt-6 sm:px-6">
      <header className="flex flex-wrap items-center justify-between gap-4 border-b border-line pb-5">
        <p className="text-lg font-extrabold tracking-tight">Auto Data Science Team</p>
        {user ? (
          <div className="flex flex-wrap items-center gap-4">
            <Stepper current={step} />
            <button onClick={logout} className="text-sm font-semibold text-accent hover:underline" title={user.email}>
              Log out
            </button>
          </div>
        ) : null}
      </header>

      <main className="mt-10 space-y-6">
        {checking && <p className="text-muted">Loading</p>}

        {!checking && !user && (
          <>
            <div className="mx-auto max-w-md text-center">
              <h1 className="text-3xl font-extrabold tracking-tight sm:text-4xl">Upload a CSV. Get the right model.</h1>
              <p className="mt-3 text-base leading-relaxed text-muted">A team of agents cleans your data, trains and tunes models, reviews the result and tells you which one to trust.</p>
            </div>
            <AuthForm onDone={setUser} />
          </>
        )}

        {user && !run && (
          <>
            <div className="max-w-2xl">
              <h1 className="text-3xl font-extrabold tracking-tight sm:text-4xl">Upload a CSV. Get the right model.</h1>
              <p className="mt-3 text-base leading-relaxed text-muted">
                The team cleans your data, trains several models, tests them fairly and tells you which one to use and why.
              </p>
            </div>
            <Dropzone onFile={handleFile} busy={busy} />
            <RunHistory items={history} onOpen={openRun} onDelete={removeRun} />
          </>
        )}

        {user && run && (run.status === "profiled" || run.status === "error") && (
          <ConfigPanel run={run} busy={busy} onTrain={handleTrain} onReset={reset} ai={ai} />
        )}
        {user && run?.status === "running" && <Progress value={run.progress} message={run.message} steps={run.steps} />}
        {user && run?.status === "done" && run.result && <Results result={run.result} steps={run.steps} runId={run.id} onReset={reset} />}

        {(error || run?.error) && (
          <p role="alert" className="rounded-xl border border-[#F4C7C3] bg-[#FDECEA] p-4 text-sm font-medium text-danger">
            {error ?? run?.error}
          </p>
        )}
      </main>
    </div>
  );
}
