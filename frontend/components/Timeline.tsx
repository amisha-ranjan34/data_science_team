import type { Step } from "@/lib/types";

const AGENT_COLORS: Record<string, string> = {
  Profiler: "bg-[#E6EEF8] text-[#1F4E8C]",
  Planner: "bg-[#EFE8F8] text-[#5B3A91]",
  Cleaner: "bg-[#E5F4EA] text-[#1B6B43]",
  Modeler: "bg-accent-soft text-accent-dark",
  Tuner: "bg-[#E8EEF3] text-[#35506B]",
  Reviewer: "bg-[#FBE9E7] text-[#9B2C1F]",
  Advisor: "bg-[#FBEFD9] text-[#8A5400]",
};

function Icon({ status }: { status: Step["status"] }) {
  if (status === "running")
    return <span className="block h-4 w-4 animate-spin rounded-full border-2 border-accent border-t-transparent" aria-label="Running" />;
  if (status === "done") return <span className="grid h-4 w-4 place-items-center rounded-full bg-good text-[10px] font-bold text-white" aria-label="Done">✓</span>;
  if (status === "skipped") return <span className="grid h-4 w-4 place-items-center rounded-full bg-[#C9D2D9] text-[10px] font-bold text-white" aria-label="Fallback used">–</span>;
  return <span className="grid h-4 w-4 place-items-center rounded-full bg-danger text-[10px] font-bold text-white" aria-label="Error">!</span>;
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
              <span className={"rounded-full px-2 py-0.5 text-xs font-bold " + (AGENT_COLORS[s.agent] ?? "bg-paper text-muted")}>{s.agent}</span>
              <span className="text-sm font-semibold">{s.title}</span>
            </div>
            {s.detail && <p className="mt-1 text-sm leading-relaxed text-muted">{s.detail}</p>}
          </div>
        </li>
      ))}
    </ol>
  );
}
