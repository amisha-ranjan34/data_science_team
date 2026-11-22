import type { Step } from "@/lib/types";

const AGENT_COLORS: Record<string, string> = {
  Profiler: "bg-blue-500/15 text-blue-300 border border-blue-500/30",
  Planner: "bg-purple-500/15 text-purple-300 border border-purple-500/30",
  Cleaner: "bg-emerald-500/15 text-emerald-300 border border-emerald-500/30",
  Modeler: "bg-cyan-500/15 text-cyan-300 border border-cyan-500/30",
  Advisor: "bg-amber-500/15 text-amber-300 border border-amber-500/30",
};

function Icon({ status }: { status: Step["status"] }) {
  if (status === "running")
    return <span className="block h-4 w-4 animate-spin rounded-full border-2 border-cyan-400 border-t-transparent" aria-label="Running" />;
  if (status === "done")
    return <span className="grid h-4 w-4 place-items-center rounded-full bg-emerald-500 text-[10px] font-bold text-white shadow-sm" aria-label="Done">✓</span>;
  if (status === "skipped")
    return <span className="grid h-4 w-4 place-items-center rounded-full bg-slate-700 text-[10px] font-bold text-slate-300" aria-label="Fallback used">–</span>;
  return <span className="grid h-4 w-4 place-items-center rounded-full bg-red-500 text-[10px] font-bold text-white shadow-sm" aria-label="Error">!</span>;
}

export default function Timeline({ steps }: { steps: Step[] }) {
  if (steps.length === 0) return null;
  return (
    <ol className="space-y-4">
      {steps.map((s) => (
        <li key={s.id} className="flex gap-3">
          <div className="mt-1"><Icon status={s.status} /></div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className={"rounded-full px-2.5 py-0.5 text-xs font-bold " + (AGENT_COLORS[s.agent] ?? "bg-surface-elevated text-slate-300 border border-line")}>
                {s.agent}
              </span>
              <span className="text-sm font-semibold text-white">{s.title}</span>
            </div>
            {s.detail && <p className="mt-1 text-xs leading-relaxed text-slate-300">{s.detail}</p>}
          </div>
        </li>
      ))}
    </ol>
  );
}
