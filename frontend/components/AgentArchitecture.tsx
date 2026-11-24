"use client";
import { useMemo, useState } from "react";
import type { Step } from "@/lib/types";

type Agent = { name: string; role: string; detail: string; icon: string };
const AGENTS: Agent[] = [
  { name: "Profiler", role: "Understand the data", detail: "Profiles columns, distributions and dataset risks before the team makes a plan.", icon: "◈" },
  { name: "Planner", role: "Design the approach", detail: "Selects the target strategy, transformations and candidate model families.", icon: "⌘" },
  { name: "Cleaner", role: "Prepare the dataset", detail: "Removes duplicates and unusable columns while keeping preprocessing leak-safe.", icon: "✳" },
  { name: "Modeler", role: "Train candidates", detail: "Cross-validates the baseline, linear model, random forest and boosting candidates.", icon: "⎔" },
  { name: "Tuner", role: "Optimize the leader", detail: "Runs a time-boxed search to improve the strongest candidate model.", icon: "⌁" },
  { name: "Reviewer", role: "Audit model quality", detail: "Checks leakage, overfitting, imbalance, tiny test sets and validation stability.", icon: "⌕" },
  { name: "Red team", role: "Challenge the winner", detail: "Stress-tests the recommendation with noisy, missing and unfamiliar inputs.", icon: "⚡" },
  { name: "Advisor", role: "Explain the outcome", detail: "Turns measured results into a grounded recommendation and plain-language summary.", icon: "✧" },
];

function normalize(value: string) { return value.toLowerCase().replace(/[^a-z]/g, ""); }

export default function AgentArchitecture({ steps, progress, message, status = "running" }: { steps: Step[]; progress: number; message: string; status?: "running" | "done" | "error" }) {
  const [selected, setSelected] = useState("Profiler");
  const stepByAgent = useMemo(() => {
    const map = new Map<string, Step>();
    steps.forEach((step) => map.set(normalize(step.agent), step));
    return map;
  }, [steps]);
  const completed = AGENTS.filter((agent) => stepByAgent.get(normalize(agent.name))?.status === "done" || stepByAgent.get(normalize(agent.name))?.status === "skipped").length;
  const active = AGENTS.find((agent) => stepByAgent.get(normalize(agent.name))?.status === "running");
  const chosen = AGENTS.find((agent) => agent.name === selected) ?? AGENTS[0];
  const pct = Math.max(0, Math.min(100, Math.round(progress * 100)));

  const stateFor = (agent: Agent, index: number) => {
    const actual = stepByAgent.get(normalize(agent.name));
    if (actual) return actual.status;
    if (status === "done") return "done";
    if (status === "error" && index === completed) return "error";
    return "pending";
  };

  return (
    <section className="glass-panel overflow-hidden rounded-[28px]">
      <div className="flex flex-wrap items-start justify-between gap-4 border-b border-white/[.07] px-5 py-5 sm:px-7">
        <div>
          <p className="eyebrow">Live orchestration map</p>
          <h2 className="mt-1 font-display text-xl font-bold text-white sm:text-2xl">Your AI team, in motion.</h2>
          <p className="mt-1 max-w-xl text-sm text-slate-400">Each node reflects the latest state received from the backend event stream.</p>
        </div>
        <div className="flex items-center gap-2 rounded-full border border-violet-300/20 bg-violet-400/[.08] px-3 py-1.5 text-xs font-semibold text-violet-200">
          <span className={`h-2 w-2 rounded-full ${status === "running" ? "animate-pulse bg-cyan-300" : status === "done" ? "bg-emerald-400" : "bg-rose-400"}`} />
          {status === "running" ? "Orchestration active" : status === "done" ? "Pipeline complete" : "Run interrupted"}
        </div>
      </div>

      <div className="grid gap-0 xl:grid-cols-[minmax(0,1.45fr)_minmax(260px,.75fr)]">
        <div className="subtle-grid relative px-4 py-6 sm:px-7 sm:py-8">
          <div className="pointer-events-none absolute left-1/2 top-0 h-48 w-48 -translate-x-1/2 rounded-full bg-violet-500/10 blur-3xl" />
          <div className="relative mx-auto max-w-[620px]">
            <div className="mb-5 flex items-center justify-center gap-2">
              <span className="grid h-9 w-9 place-items-center rounded-xl border border-cyan-300/20 bg-cyan-300/10 text-lg text-cyan-200">▦</span>
              <div className="text-center">
                <p className="text-[10px] font-bold uppercase tracking-[.18em] text-cyan-200/80">Input layer</p>
                <p className="text-xs font-semibold text-slate-200">Dataset profile · Target · Constraints</p>
              </div>
            </div>
            <div className="mx-auto h-7 w-px bg-gradient-to-b from-cyan-300/70 to-violet-400/50" />
            <div className="mx-auto flex max-w-[470px] flex-col items-stretch">
              {AGENTS.map((agent, index) => {
                const state = stateFor(agent, index);
                const isSelected = selected === agent.name;
                const stateClass = state === "running" ? "agent-running border-violet-300/60 bg-violet-400/[.12]" : state === "done" || state === "skipped" ? "border-emerald-300/25 bg-emerald-400/[.055]" : state === "error" ? "border-rose-300/40 bg-rose-400/[.08]" : "border-white/[.09] bg-slate-950/35";
                return (
                  <div key={agent.name} className="flex flex-col items-center">
                    <button type="button" onClick={() => setSelected(agent.name)} className={`group relative flex min-h-[76px] w-full items-center gap-3 rounded-2xl border p-3 text-left transition-all duration-300 hover:-translate-y-0.5 hover:border-violet-300/40 ${stateClass} ${isSelected ? "ring-1 ring-violet-300/40" : ""}`}>
                      <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl border text-lg ${state === "running" ? "border-violet-200/30 bg-violet-300/15 text-violet-100" : state === "done" || state === "skipped" ? "border-emerald-200/20 bg-emerald-300/10 text-emerald-200" : "border-white/10 bg-white/[.04] text-slate-300"}`}>{agent.icon}</span>
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center gap-2"><span className="text-sm font-bold text-slate-100">{String(index + 1).padStart(2, "0")} · {agent.name}</span><span className={`h-1.5 w-1.5 rounded-full ${state === "running" ? "animate-pulse bg-cyan-300" : state === "done" || state === "skipped" ? "bg-emerald-400" : state === "error" ? "bg-rose-400" : "bg-slate-600"}`} /></span>
                        <span className="mt-1 block truncate text-[11px] text-slate-400">{agent.role}</span>
                      </span>
                      <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">{state === "skipped" ? "Fallback" : state === "pending" ? "Queued" : state}</span>
                      <span className="absolute -right-1 -top-1 rounded-full border border-white/10 bg-[#171a2b] px-1.5 py-0.5 text-[9px] font-bold text-slate-500">{index + 1}/8</span>
                    </button>
                    {index < AGENTS.length - 1 && <div className="relative h-5 w-px bg-gradient-to-b from-violet-300/55 to-cyan-300/35"><span className="absolute -bottom-0.5 -left-[3px] h-1.5 w-1.5 rotate-45 border-b border-r border-cyan-200/70" /></div>}
                  </div>
                );
              })}
            </div>
            <div className="mx-auto h-7 w-px bg-gradient-to-b from-violet-400/50 to-emerald-300/70" />
            <div className="mx-auto flex max-w-sm items-center justify-center gap-3 rounded-2xl border border-emerald-300/25 bg-emerald-400/[.07] px-4 py-3">
              <span className="grid h-9 w-9 place-items-center rounded-xl bg-emerald-300/10 text-emerald-200">✦</span>
              <div><p className="text-xs font-bold text-emerald-100">Intelligence output</p><p className="text-[10px] text-emerald-100/60">Recommendation · Evaluation · Artifacts</p></div>
            </div>
          </div>
        </div>

        <aside className="border-t border-white/[.07] bg-black/10 p-5 sm:p-6 xl:border-l xl:border-t-0">
          <p className="eyebrow">Execution telemetry</p>
          <div className="mt-4 flex items-end justify-between"><span className="text-sm text-slate-400">Pipeline progress</span><span className="font-display text-3xl font-bold text-white">{pct}<span className="text-base text-slate-500">%</span></span></div>
          <div className="mt-3 h-2 overflow-hidden rounded-full bg-white/[.07]"><div className="h-full rounded-full bg-gradient-to-r from-violet-400 via-indigo-400 to-cyan-300 transition-[width] duration-700" style={{ width: `${pct}%` }} /></div>
          <div className="mt-3 flex justify-between text-[11px] text-slate-500"><span>{completed} / 8 agents completed</span><span>Live stream</span></div>
          <div className="mt-6 rounded-2xl border border-white/[.08] bg-white/[.035] p-4">
            <div className="flex items-center justify-between gap-3"><span className="text-[10px] font-bold uppercase tracking-[.15em] text-slate-500">Selected agent</span><span className="rounded-full bg-violet-300/10 px-2 py-1 text-[10px] font-bold text-violet-200">{stateFor(chosen, AGENTS.indexOf(chosen))}</span></div>
            <h3 className="mt-3 font-display text-lg font-bold text-white">{chosen.name}</h3>
            <p className="mt-1 text-xs font-semibold text-cyan-200">{chosen.role}</p>
            <p className="mt-3 text-sm leading-relaxed text-slate-400">{stepByAgent.get(normalize(chosen.name))?.detail || chosen.detail}</p>
          </div>
          <div className="mt-5">
            <p className="text-[10px] font-bold uppercase tracking-[.15em] text-slate-500">Latest backend event</p>
            <p className="mt-2 min-h-[44px] text-sm leading-relaxed text-slate-300">{message || active ? (message || `${active?.name} is processing.`) : "Waiting for the first agent event…"}</p>
          </div>
          {steps.length > 0 && <div className="mt-4 border-t border-white/[.07] pt-4"><p className="text-[10px] font-bold uppercase tracking-[.15em] text-slate-500">Latest activity</p><div className="mt-3 space-y-3">{steps.slice(-3).reverse().map((step) => <div key={step.id} className="flex gap-2.5"><span className={`mt-1 h-1.5 w-1.5 shrink-0 rounded-full ${step.status === "done" ? "bg-emerald-400" : step.status === "error" ? "bg-rose-400" : "bg-cyan-300"}`} /><div className="min-w-0"><p className="text-xs font-semibold text-slate-200">{step.agent} · {step.title}</p><p className="mt-0.5 line-clamp-2 text-[11px] text-slate-500">{step.detail}</p></div></div>)}</div></div>}
        </aside>
      </div>
    </section>
  );
}
