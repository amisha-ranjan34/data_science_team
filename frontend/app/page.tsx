"use client";

import { useCallback, useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import AuthForm from "@/components/AuthForm";
import ConfigPanel from "@/components/ConfigPanel";
import Dropzone from "@/components/Dropzone";
import AgentArchitecture from "@/components/AgentArchitecture";
import Results from "@/components/Results";
import RunHistory from "@/components/RunHistory";
import ThemeToggle from "@/components/ThemeToggle";
import {
  AuthError, deleteRun, getConfig, getMe, getRun, logout as endSession,
  listRuns, startTraining, streamRun, uploadCsv, verifyEmail,
} from "@/lib/api";
import type { AiInfo, Run, RunSummary, Task, User } from "@/lib/types";

const apiDocsUrl = `${process.env.NEXT_PUBLIC_API_URL ?? ""}/docs`;

function Brand() {
  return <span className="font-display text-2xl leading-none">AutoDS<span className="text-accent">.</span></span>;
}

export default function Home() {
  const [user, setUser] = useState<User | null>(null);
  const [checking, setChecking] = useState(true);
  const [run, setRun] = useState<Run | null>(null);
  const [history, setHistory] = useState<RunSummary[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ai, setAi] = useState<AiInfo | null>(null);
  const [displayName, setDisplayName] = useState("");
  const [finalizedRunId, setFinalizedRunId] = useState<string | null>(null);
  const [agentFocused, setAgentFocused] = useState(false);

  const logout = useCallback(() => {
    void endSession().catch((e: unknown) => setError(e instanceof Error ? e.message : "Could not end the session."));
    setUser(null);
    setRun(null);
    setHistory([]);
    setError(null);
    setFinalizedRunId(null);
    setAgentFocused(false);
  }, []);
  const fail = useCallback((e: unknown) => {
    if (e instanceof AuthError) logout();
    else setError(e instanceof Error ? e.message : "Something went wrong.");
  }, [logout]);

  useEffect(() => {
    window.localStorage.removeItem("adst_token");
    setDisplayName(window.localStorage.getItem("autods-display-name")?.trim() || "");
    getConfig().then((c) => setAi(c.ai)).catch(() => setAi(null));
    const verification = new URLSearchParams(window.location.search).get("verify");
    const session = verification
      ? verifyEmail(verification).then(({ user: verified }) => {
          window.history.replaceState({}, "", window.location.pathname);
          setUser(verified);
        }).catch((e: unknown) => {
          setError(e instanceof Error ? e.message : "Email verification failed.");
        })
      : getMe().then(setUser).catch(() => setUser(null));
    session.finally(() => setChecking(false));
  }, []);

  useEffect(() => {
    if (user && !run) listRuns().then(setHistory).catch(fail);
  }, [user, run, fail]);

  const runId = run?.id;
  const running = run?.status === "running";
  useEffect(() => {
    if (!runId || !running) return;
    const ctrl = new AbortController();
    let timer: ReturnType<typeof setInterval> | undefined;
    streamRun(runId, setRun, ctrl.signal).catch((e) => {
      if (ctrl.signal.aborted) return;
      if (e instanceof AuthError) fail(e);
      else timer = setInterval(() => getRun(runId).then(setRun).catch(fail), 1000);
    });
    return () => { ctrl.abort(); if (timer) clearInterval(timer); };
  }, [runId, running, fail]);

  const reset = () => { setRun(null); setError(null); setFinalizedRunId(null); setAgentFocused(false); };
  async function handleFile(file: File) {
    setBusy(true); setError(null);
    try { setRun(await uploadCsv(file)); setFinalizedRunId(null); }
    catch (e) { fail(e); }
    finally { setBusy(false); }
  }
  async function handleTrain(target: string, task: Task) {
    if (!run) return;
    setBusy(true); setError(null);
    try {
      await startTraining(run.id, target, task);
      setRun({ ...run, status: "running", progress: 0, message: "Starting the agent team.", result: null, error: null, steps: [] });
      setFinalizedRunId(null);
    } catch (e) { fail(e); }
    finally { setBusy(false); }
  }
  async function openRun(id: string) {
    setError(null);
    try {
      const selectedRun = await getRun(id);
      setRun(selectedRun);
      setFinalizedRunId(selectedRun.status === "done" ? selectedRun.id : null);
      setAgentFocused(false);
    } catch (e) { fail(e); }
  }
  const handleWhatIf = (nextRun: Run) => {
    setRun(nextRun);
    setFinalizedRunId(nextRun.status === "done" ? nextRun.id : null);
  };
  async function removeRun(id: string) {
    try { await deleteRun(id); setHistory((h) => h.filter((r) => r.id !== id)); }
    catch (e) { fail(e); }
  }

  if (checking) return (
    <main className="grid min-h-screen place-items-center">
      <div className="text-center"><Brand /><p className="mt-4 font-mono text-[12px] uppercase tracking-[.12em] text-text-2">Preparing workspace</p></div>
    </main>
  );

  if (!user) return (
    <main className="grid min-h-screen lg:grid-cols-[7fr_5fr]">
      <section className="hidden min-h-screen flex-col justify-between px-10 py-8 lg:flex xl:px-16">
        <div className="flex items-center justify-between"><Brand /><ThemeToggle /></div>
        <div className="max-w-4xl py-12">
          <p className="eyebrow">Eight specialists / one verdict</p>
          <h1 className="mt-5 max-w-[15ch] font-display text-5xl leading-tight tracking-tight">
            Eight AI specialists. <span className="text-volt">One model you can trust.</span>
          </h1>
          <div className="mt-10 grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-line bg-line sm:grid-cols-4">
            {[["ID", "AGE"], ["INCOME", "SIGNAL"], ["CITY", "STATUS"], ["RISK", "SCORE"]].map((row, i) => (
              <div key={i} className="bg-surface px-4 py-3 font-mono text-[12px] uppercase text-text-2">
                {row.map((cell) => <span key={cell} className="block py-1">{cell}</span>)}
              </div>
            ))}
          </div>
        </div>
        <p className="font-mono text-[12px] uppercase tracking-[.12em] text-text-3">v1.0 / Eight agents. One verdict.</p>
      </section>
      <section className="flex min-h-screen items-center border-l border-line px-6 py-10 sm:px-12">
        <div className="mx-auto w-full max-w-md">
          <div className="mb-12 flex items-center justify-between lg:hidden"><Brand /><ThemeToggle /></div>
          <p className="eyebrow">Workspace access</p>
          <h2 className="mt-3 font-display text-3xl leading-tight">Sign in to your workspace</h2>
          {error && <p role="alert" className="mt-5 text-sm text-[var(--error)]">{error}</p>}
          <div className="mt-10"><AuthForm onDone={setUser} /></div>
        </div>
      </section>
    </main>
  );

  const completed = history.filter((r) => r.status === "done").length;
  const active = history.filter((r) => r.status === "running").length;
  const identityName = displayName || "there";
  const recentTrend = history.slice(0, 8).reverse();

  function TrendChart({ values, accent = false }: { values: number[]; accent?: boolean }) {
    const width = 180;
    const height = 46;
    const max = Math.max(...values, 1);
    const points = values.length
      ? values.map((value, index) => {
          const x = values.length === 1 ? width / 2 : (index / (values.length - 1)) * width;
          const y = height - (value / max) * (height - 6) - 3;
          return `${x},${y}`;
        }).join(" ")
      : `0,${height - 3} ${width},${height - 3}`;
    return (
      <svg viewBox={`0 0 ${width} ${height}`} className="h-12 w-full" role="img" aria-label="Recent experiment trend">
        <line x1="0" x2={width} y1={height - 3} y2={height - 3} stroke="var(--line-strong)" />
        <polyline points={points} fill="none" stroke={accent ? "var(--volt)" : "var(--text-2)"} strokeWidth="2" />
      </svg>
    );
  }

  return (
    <div className={`app-shell min-h-screen ${agentFocused ? "focus-mode" : ""}`}>
      <header className={`sticky top-0 ${agentFocused ? "z-10" : "z-30"} border-b border-line bg-bg/95`}>
        <div className="mx-auto flex h-16 max-w-[1500px] items-center gap-6 px-4 sm:px-7 lg:px-12">
          <Brand />
          <nav className="hidden h-full items-center gap-1 md:flex" aria-label="Primary navigation">
            <a href="#overview" className="flex h-full items-center border-b-2 border-volt px-4 text-[13px] font-semibold text-text">Overview</a>
            <a href="#experiments" className="flex h-full items-center border-b-2 border-transparent px-4 text-[13px] font-semibold text-text-2 hover:border-line-strong hover:text-text">Experiments</a>
            <a href={apiDocsUrl} target="_blank" rel="noreferrer" className="flex h-full items-center border-b-2 border-transparent px-4 text-[13px] font-semibold text-text-2 hover:border-line-strong hover:text-text">API docs</a>
          </nav>
          <div className="ml-auto flex items-center gap-3">
            <button onClick={() => document.getElementById("new-experiment")?.scrollIntoView({ behavior: "smooth" })} className="ui-button ui-button-primary px-4">New experiment</button>
            <button onClick={logout} className="ui-button ui-button-secondary hidden px-4 sm:block">Log out</button>
          </div>
        </div>
        <nav className="flex h-11 items-center gap-1 border-t border-line px-3 md:hidden" aria-label="Mobile navigation">
          <a href="#overview" className="flex h-full items-center border-b-2 border-volt px-3 text-[13px] font-semibold text-text">Overview</a>
          <a href="#experiments" className="flex h-full items-center border-b-2 border-transparent px-3 text-[13px] font-semibold text-text-2">Experiments</a>
          <a href={apiDocsUrl} target="_blank" rel="noreferrer" className="flex h-full items-center border-b-2 border-transparent px-3 text-[13px] font-semibold text-text-2">API</a>
        </nav>
      </header>

      <main className="mx-auto max-w-[1500px] px-4 pb-16 sm:px-7 lg:px-12">
        {!run && <>
          <section id="overview" className="mt-6 border-b border-line pb-6">
            <div className="flex flex-wrap items-end justify-between gap-4">
              <div>
                <p className="eyebrow">01 / Overview</p>
                <h1 className="mt-2 font-display text-4xl leading-tight">Welcome back, {identityName}</h1>
              </div>
              <button onClick={() => document.getElementById("new-experiment")?.scrollIntoView({ behavior: "smooth" })} className="ui-button ui-button-primary md:hidden">New experiment</button>
            </div>
            <div className="mt-5 grid gap-3 sm:grid-cols-3">
              {[
                ["Total", history.length, recentTrend.map((_, i) => i + 1)],
                ["Completed", completed, recentTrend.map((r) => r.status === "done" ? 1 : 0)],
                ["Active", active, recentTrend.map((r) => r.status === "running" ? 1 : 0)],
              ].map(([label, value, values], i) => (
                <article key={String(label)} className="rounded-lg border border-line-strong bg-surface p-4">
                  <div className="flex items-start justify-between">
                    <p className="text-[13px] font-semibold text-text-2">{label}</p>
                    <span className={`ui-badge ${i === 1 ? "border-ok text-ok" : i === 2 ? "border-volt text-volt" : "border-line-strong text-text-2"}`}>{i === 1 ? "ready" : i === 2 ? "live" : "runs"}</span>
                  </div>
                  <p className="mt-2 font-display text-4xl leading-none">{value}</p>
                  <TrendChart values={values as number[]} accent={i !== 0} />
                </article>
              ))}
            </div>
          </section>

          <section className="section-rule mt-16 pt-5" id="new-experiment">
            <p className="eyebrow">02 / New experiment</p>
            <div className="mt-5"><Dropzone onFile={handleFile} busy={busy} /></div>
          </section>

          <section className="section-rule mt-16 pt-5" id="experiments">
            <div className="flex items-end justify-between"><div><p className="eyebrow">03 / Experiments</p><h2 className="mt-3 font-display text-3xl leading-tight">Recent experiments</h2></div><p className="font-mono text-[12px] text-text-2">{history.length} records</p></div>
            <div className="mt-6"><RunHistory items={history} onOpen={openRun} onDelete={removeRun} /></div>
            {history.length === 0 && <p className="mt-8 font-display text-3xl text-muted">No experiments filed yet.</p>}
          </section>
        </>}

        {run && (run.status === "profiled" || run.status === "error") && (
          <section className="mt-10">
            <p className="eyebrow">02 / Experiment setup</p>
            <h1 className="mt-3 font-display text-4xl leading-tight">Configure the experiment</h1>
            <div className="mt-8"><ConfigPanel run={run} busy={busy} onTrain={handleTrain} onReset={reset} ai={ai} /></div>
          </section>
        )}
        {agentFocused && <div className="focus-scrim" aria-hidden="true" />}
        <AnimatePresence mode="wait" initial={false}>
          {run && (run.status === "running" || (run.status === "done" && run.result && finalizedRunId !== run.id)) && (
            <motion.section
              key={`live-${run.id}`}
              className={`mt-6 ${agentFocused ? "relative z-30" : ""}`}
              initial={{ opacity: 0, y: 18 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -18, scale: 0.98 }}
              transition={{ duration: 0.45, ease: "easeOut" }}
            >
              <p className="eyebrow orchestration-page-heading">03 / Live orchestration</p>
              <h1 className="mt-2 font-display text-3xl leading-tight orchestration-page-heading">The team is working</h1>
              <div className="mt-5"><AgentArchitecture run={run} steps={run.steps} status={run.status} onFinal={() => setFinalizedRunId(run.id)} onFocusChange={setAgentFocused} /></div>
            </motion.section>
          )}
          {run?.status === "done" && run.result && finalizedRunId === run.id && (
            <motion.section
              key={`results-${run.id}`}
              className="mt-10"
              initial={{ opacity: 0, y: 28, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -16 }}
              transition={{ duration: 0.55, ease: "easeOut" }}
            >
              <div className="sr-only"><p className="eyebrow">04 / Intelligence report</p><h1>The verdict is in</h1></div>
              <Results result={run.result} steps={run.steps} runId={run.id} onReset={reset} onWhatIf={handleWhatIf} onOpenRun={openRun} />
            </motion.section>
          )}
        </AnimatePresence>
        {(error || run?.error) && <p role="alert" className="mt-6 border-l border-accent pl-3 text-sm text-[var(--error)]">{error ?? run?.error}</p>}
      </main>
    </div>
  );
}
