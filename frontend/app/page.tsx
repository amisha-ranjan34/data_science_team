"use client";
import { useCallback, useEffect, useState } from "react";
import AuthForm from "@/components/AuthForm";
import ConfigPanel from "@/components/ConfigPanel";
import Dropzone from "@/components/Dropzone";
import AgentArchitecture from "@/components/AgentArchitecture";
import Results from "@/components/Results";
import RunHistory from "@/components/RunHistory";
import { AuthError, clearToken, deleteRun, getConfig, getMe, getRun, getToken, listRuns, startTraining, streamRun, uploadCsv } from "@/lib/api";
import type { AiInfo, Run, RunSummary, Task, User } from "@/lib/types";

const message = (e: unknown) => (e instanceof Error ? e.message : "Something went wrong.");

function BrandMark() {
  return <div className="grid h-10 w-10 place-items-center rounded-[14px] border border-violet-300/30 bg-gradient-to-br from-violet-400/25 to-cyan-300/10 font-display text-lg font-bold text-white shadow-[0_0_28px_rgba(139,92,246,.22)]">A<span className="text-cyan-200">.</span></div>;
}

function StatCard({ label, value, note, icon }: { label: string; value: string | number; note: string; icon: string }) {
  return <div className="soft-panel rounded-2xl p-4 sm:p-5"><div className="flex items-start justify-between"><p className="text-xs font-semibold text-slate-400">{label}</p><span className="grid h-8 w-8 place-items-center rounded-xl bg-violet-300/[.09] text-base text-violet-200">{icon}</span></div><p className="mt-3 font-display text-2xl font-bold tracking-tight text-white">{value}</p><p className="mt-1 text-[11px] text-slate-500">{note}</p></div>;
}

export default function Home() {
  const [user, setUser] = useState<User | null>(null);
  const [checking, setChecking] = useState(true);
  const [run, setRun] = useState<Run | null>(null);
  const [history, setHistory] = useState<RunSummary[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ai, setAi] = useState<AiInfo | null>(null);

  const logout = useCallback(() => {
    clearToken(); setUser(null); setRun(null); setHistory([]); setError(null);
  }, []);
  const fail = useCallback((e: unknown) => (e instanceof AuthError ? logout() : setError(message(e))), [logout]);

  useEffect(() => {
    getConfig().then((c) => setAi(c.ai)).catch(() => setAi(null));
    if (!getToken()) { setChecking(false); return; }
    getMe().then(setUser).catch(() => clearToken()).finally(() => setChecking(false));
  }, []);

  useEffect(() => { if (user && !run) listRuns().then(setHistory).catch(fail); }, [user, run, fail]);

  const runId = run?.id;
  const running = run?.status === "running";
  useEffect(() => {
    if (!runId || !running) return;
    const ctrl = new AbortController();
    let timer: ReturnType<typeof setInterval> | undefined;
    const poll = () => { if (!timer) timer = setInterval(() => getRun(runId).then(setRun).catch(fail), 1000); };
    streamRun(runId, setRun, ctrl.signal).then(async () => {
      if (ctrl.signal.aborted) return;
      const latest = await getRun(runId); setRun(latest); if (latest.status === "running") poll();
    }).catch((e) => { if (ctrl.signal.aborted) return; if (e instanceof AuthError) fail(e); else poll(); });
    return () => { ctrl.abort(); if (timer) clearInterval(timer); };
  }, [runId, running, fail]);

  const reset = () => { setRun(null); setError(null); };
  async function handleFile(file: File) {
    setBusy(true); setError(null);
    try { setRun(await uploadCsv(file)); } catch (e) { fail(e); } finally { setBusy(false); }
  }
  async function handleTrain(target: string, task: Task) {
    if (!run) return;
    setBusy(true); setError(null);
    try { await startTraining(run.id, target, task); setRun({ ...run, status: "running", progress: 0, message: "Starting the agent team…", result: null, error: null, steps: [] }); }
    catch (e) { fail(e); } finally { setBusy(false); }
  }
  async function openRun(id: string) { setError(null); try { setRun(await getRun(id)); } catch (e) { fail(e); } }
  async function removeRun(id: string) {
    if (!window.confirm("Delete this run and its files?")) return;
    try { await deleteRun(id); setHistory((h) => h.filter((r) => r.id !== id)); } catch (e) { fail(e); }
  }

  const completedRuns = history.filter((item) => item.status === "done").length;
  const activeRuns = history.filter((item) => item.status === "running").length;

  if (checking) return <main className="grid min-h-screen place-items-center"><div className="text-center"><BrandMark /><p className="mt-4 text-sm text-slate-400">Preparing your workspace…</p><div className="mx-auto mt-4 h-1 w-36 overflow-hidden rounded-full bg-white/10"><div className="h-full w-1/2 animate-pulse rounded-full bg-gradient-to-r from-violet-400 to-cyan-300" /></div></div></main>;

  if (!user) return (
    <main className="relative grid min-h-screen overflow-hidden px-4 py-10 sm:px-6 lg:grid-cols-[1.1fr_.9fr] lg:px-12">
      <div className="pointer-events-none absolute -left-28 top-1/4 h-96 w-96 rounded-full bg-violet-600/10 blur-[100px]" />
      <section className="relative hidden flex-col justify-between py-8 pr-12 lg:flex">
        <div className="flex items-center gap-3"><BrandMark /><div><p className="font-display text-lg font-bold text-white">AutoDS <span className="text-violet-300">Team</span></p><p className="text-[10px] uppercase tracking-[.2em] text-slate-500">Autonomous data science</p></div></div>
        <div className="max-w-xl"><p className="eyebrow">Your AI-powered ML workspace</p><h1 className="mt-5 font-display text-5xl font-bold leading-[1.08] tracking-tight text-white xl:text-6xl">From raw data to a model <span className="gradient-text">you can trust.</span></h1><p className="mt-6 max-w-lg text-base leading-8 text-slate-400">Eight specialist agents work as one team — profiling your data, training candidates, reviewing risks and challenging the final recommendation.</p><div className="mt-10 grid max-w-lg grid-cols-2 gap-3">{["Leak-safe ML pipeline", "Live agent orchestration", "Model review & red team", "Reproducible artifacts"].map((item, i) => <div key={item} className="flex items-center gap-2 rounded-xl border border-white/[.07] bg-white/[.025] px-3 py-3 text-xs font-semibold text-slate-300"><span className="text-cyan-200">{["✳", "⌘", "⌕", "↗"][i]}</span>{item}</div>)}</div></div>
        <p className="text-xs text-slate-600">Built for curious minds and careful machine learning.</p>
      </section>
      <section className="relative flex items-center justify-center lg:py-10"><div className="w-full max-w-md"><div className="mb-8 flex items-center gap-3 lg:hidden"><BrandMark /><div><p className="font-display text-lg font-bold text-white">AutoDS Team</p><p className="text-xs text-slate-500">AI Data Science Command Center</p></div></div><div className="glass-panel rounded-[28px] p-5 sm:p-8"><p className="eyebrow">Welcome to the lab</p><h2 className="mt-2 font-display text-2xl font-bold text-white">Sign in to your workspace</h2><p className="mt-2 mb-6 text-sm text-slate-400">Your experiments, models and agent runs — all in one place.</p><AuthForm onDone={setUser} /></div><p className="mt-5 text-center text-[11px] text-slate-600">Secure workspace · Personal experiment history</p></div></section>
    </main>
  );

  return (
    <div className="min-h-screen">
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-[248px] flex-col border-r border-white/[.07] bg-[#0b0e1a]/90 px-5 py-6 backdrop-blur-xl lg:flex">
        <div className="flex items-center gap-3 px-1"><BrandMark /><div><p className="font-display text-base font-bold text-white">AutoDS <span className="text-violet-300">Team</span></p><p className="text-[9px] font-bold uppercase tracking-[.2em] text-slate-500">Command center</p></div></div>
        <div className="mt-10"><p className="px-3 text-[10px] font-bold uppercase tracking-[.18em] text-slate-600">Workspace</p><nav className="mt-3 space-y-1"><a href="#workspace" className="flex items-center gap-3 rounded-xl border border-violet-300/15 bg-violet-400/[.09] px-3 py-3 text-sm font-semibold text-violet-100"><span>◫</span> Overview</a><a href="#experiments" className="flex items-center gap-3 rounded-xl px-3 py-3 text-sm font-medium text-slate-400 transition hover:bg-white/[.04] hover:text-white"><span>◷</span> Experiments</a><a href="http://localhost:8000/docs" target="_blank" rel="noreferrer" className="flex items-center gap-3 rounded-xl px-3 py-3 text-sm font-medium text-slate-400 transition hover:bg-white/[.04] hover:text-white"><span>⌘</span> API explorer <span className="ml-auto text-xs">↗</span></a></nav></div>
        <div className="mt-auto rounded-2xl border border-cyan-300/15 bg-cyan-300/[.045] p-4"><div className="flex items-center gap-2"><span className={`h-2 w-2 rounded-full ${ai?.enabled ? "bg-emerald-400" : "bg-amber-300"}`} /><p className="text-xs font-bold text-slate-200">{ai?.enabled ? "AI provider connected" : "Rule-based mode"}</p></div><p className="mt-2 text-[11px] leading-relaxed text-slate-500">{ai?.enabled ? `${ai.provider} · ${ai.model}` : "Add an AI key in backend/.env to enable LLM-powered planning and explanations."}</p></div>
        <div className="mt-4 flex items-center gap-3 border-t border-white/[.07] pt-4"><div className="grid h-9 w-9 place-items-center rounded-full bg-gradient-to-br from-violet-400/30 to-cyan-300/20 text-xs font-bold text-white">{user.email.slice(0, 1).toUpperCase()}</div><div className="min-w-0 flex-1"><p className="truncate text-xs font-semibold text-slate-200">{user.email}</p><p className="text-[10px] text-slate-500">Personal workspace</p></div><button onClick={logout} title="Log out" className="rounded-lg px-2 py-1 text-slate-500 hover:bg-white/[.05] hover:text-white">↗</button></div>
      </aside>

      <main id="workspace" className="mx-auto max-w-[1500px] px-4 pb-16 pt-5 sm:px-7 lg:ml-[248px] lg:px-9 lg:pt-8 xl:px-12">
        <header className="flex flex-wrap items-center justify-between gap-4 border-b border-white/[.07] pb-5">
          <div className="flex items-center gap-3 lg:hidden"><BrandMark /><div><p className="font-display font-bold text-white">AutoDS Team</p><p className="text-[10px] text-slate-500">AI command center</p></div></div>
          <div className="hidden lg:block"><p className="text-xs text-slate-500">Workspace / <span className="text-slate-300">Overview</span></p><p className="mt-1 text-sm font-semibold text-slate-200">Good to see you, {user.email.split("@")[0]}</p></div>
          <div className="ml-auto flex items-center gap-3"><span className="hidden items-center gap-2 rounded-full border border-emerald-300/15 bg-emerald-300/[.05] px-3 py-2 text-[11px] font-semibold text-emerald-200 sm:flex"><span className="h-1.5 w-1.5 rounded-full bg-emerald-300" /> API workspace</span><button onClick={logout} className="rounded-xl border border-white/10 px-3 py-2 text-xs font-semibold text-slate-400 transition hover:border-rose-300/30 hover:text-rose-200 lg:hidden">Log out</button></div>
        </header>

        {!run && <>
          <section className="relative mt-8 overflow-hidden rounded-[28px] border border-violet-300/15 bg-gradient-to-br from-[#211b42]/90 via-[#151a31]/95 to-[#0f1e2c]/90 p-6 sm:p-8 lg:p-10">
            <div className="pointer-events-none absolute -right-10 -top-28 h-80 w-80 rounded-full bg-violet-500/15 blur-[80px]" /><div className="pointer-events-none absolute bottom-[-130px] right-[22%] h-64 w-64 rounded-full bg-cyan-400/10 blur-[70px]" />
            <div className="relative max-w-3xl"><p className="eyebrow">Autonomous machine learning workspace</p><h1 className="mt-3 font-display text-3xl font-bold leading-tight text-white sm:text-4xl lg:text-5xl">Make your next model <span className="gradient-text">a team effort.</span></h1><p className="mt-4 max-w-2xl text-sm leading-7 text-slate-300/75 sm:text-base">One dataset. Eight specialist agents. A transparent journey from first profile to a model recommendation you can inspect, challenge and reproduce.</p><div className="mt-6 flex flex-wrap gap-2"><span className="rounded-full border border-white/10 bg-white/[.05] px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-300">Agentic AutoML</span><span className="rounded-full border border-white/10 bg-white/[.05] px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-300">Leakage-aware</span><span className="rounded-full border border-white/10 bg-white/[.05] px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-300">Explainable results</span></div></div>
            <div className="pointer-events-none absolute bottom-7 right-8 hidden h-36 w-36 animate-float-slow items-center justify-center rounded-full border border-violet-200/15 bg-violet-300/[.04] lg:flex"><div className="absolute inset-3 rounded-full border border-dashed border-cyan-200/20" /><div className="grid h-16 w-16 place-items-center rounded-2xl border border-violet-200/30 bg-violet-300/10 text-3xl text-violet-100 shadow-[0_0_45px_rgba(139,92,246,.25)]">✧</div><span className="absolute -right-1 top-7 h-3 w-3 rounded-full bg-cyan-200 shadow-[0_0_18px_rgba(85,217,245,.8)]" /><span className="absolute bottom-3 left-3 h-2 w-2 rounded-full bg-violet-200" /></div>
          </section>
          <section className="mt-5 grid gap-3 sm:grid-cols-3"><StatCard label="Total experiments" value={history.length} note="Across your workspace" icon="◷" /><StatCard label="Completed runs" value={completedRuns} note="Results ready to explore" icon="✓" /><StatCard label="Active runs" value={activeRuns} note="Currently in progress" icon="⌁" /></section>
          <section className="mt-8" id="new-experiment"><div className="mb-4 flex items-end justify-between gap-3"><div><p className="eyebrow">01 / Data ingestion</p><h2 className="mt-1 font-display text-xl font-bold text-white sm:text-2xl">Start an experiment</h2></div><span className="hidden text-xs text-slate-500 sm:block">Your data stays in your configured backend storage</span></div><Dropzone onFile={handleFile} busy={busy} /></section>
          <section className="mt-9" id="experiments"><div className="mb-4 flex items-end justify-between"><div><p className="eyebrow">Workspace memory</p><h2 className="mt-1 font-display text-xl font-bold text-white">Recent experiments</h2></div><span className="text-xs text-slate-500">{history.length} total</span></div><div className="soft-panel rounded-2xl p-4 sm:p-5"><RunHistory items={history} onOpen={openRun} onDelete={removeRun} />{history.length === 0 && <div className="py-8 text-center"><div className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-white/[.04] text-xl text-slate-500">◷</div><p className="mt-3 text-sm font-semibold text-slate-300">Your experiment history is waiting</p><p className="mt-1 text-xs text-slate-500">Upload your first dataset to get started.</p></div>}</div></section>
        </>}

        {run && (run.status === "profiled" || run.status === "error") && <section className="mt-8"><div className="mb-5"><p className="eyebrow">02 / Experiment setup</p><h1 className="mt-1 font-display text-3xl font-bold text-white">Configure your model</h1><p className="mt-2 text-sm text-slate-400">Your dataset is profiled. Confirm the prediction target and let the team get to work.</p></div><ConfigPanel run={run} busy={busy} onTrain={handleTrain} onReset={reset} ai={ai} /></section>}
        {run?.status === "running" && <section className="mt-8 space-y-5"><div><p className="eyebrow">03 / Live orchestration</p><h1 className="mt-1 font-display text-3xl font-bold text-white">The team is thinking.</h1><p className="mt-2 text-sm text-slate-400">Follow every agent as it moves through the pipeline. The map updates from real backend events.</p></div><AgentArchitecture steps={run.steps} progress={run.progress} message={run.message} status="running" /><div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-white/[.07] bg-white/[.025] px-4 py-3"><div><p className="text-xs font-semibold text-slate-200">{run.filename}</p><p className="mt-1 text-[11px] text-slate-500">Experiment ID · {run.id}</p></div><span className="rounded-full border border-cyan-300/20 bg-cyan-300/[.06] px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider text-cyan-200">Processing</span></div></section>}
        {run?.status === "done" && run.result && <section className="mt-8"><div className="mb-5"><p className="eyebrow">04 / Intelligence report</p><h1 className="mt-1 font-display text-3xl font-bold text-white">The results are in.</h1><p className="mt-2 text-sm text-slate-400">Review the recommendation, compare candidates and inspect the quality checks.</p></div><Results result={run.result} steps={run.steps} runId={run.id} onReset={reset} /></section>}

        {(error || run?.error) && <p role="alert" className="mt-6 rounded-xl border border-rose-300/20 bg-rose-400/[.08] p-4 text-sm font-medium text-rose-200">{error ?? run?.error}</p>}
        <footer className="mt-12 flex flex-wrap items-center justify-between gap-3 border-t border-white/[.07] pt-5 text-[10px] text-slate-600"><span>AutoDS Team · Autonomous data science</span><span>Built for transparent, reproducible ML</span></footer>
      </main>
    </div>
  );
}
