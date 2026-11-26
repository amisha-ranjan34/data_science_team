import type { Step } from "@/lib/types";

function Icon({ status }: { status: Step["status"] }) {
  if (status === "running")
    return <span className="block h-4 w-4 animate-spin rounded-full border-2 border-accent border-t-transparent" aria-label="Running" />;
  if (status === "done") return <span className="grid h-4 w-4 place-items-center rounded-full bg-ink text-[10px] text-paper" aria-label="Done">✓</span>;
  if (status === "skipped") return <span className="grid h-4 w-4 place-items-center rounded-full border border-ink text-[10px]" aria-label="Fallback used">–</span>;
  return <span className="grid h-4 w-4 place-items-center rounded-full bg-accent text-[10px] text-white" aria-label="Error">!</span>;
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
              <span className="border-b border-line px-0 py-0.5 font-mono text-[9px] uppercase text-muted">{s.agent}</span>
              <span className="text-sm font-semibold">{s.title}</span>
            </div>
            {s.detail && <p className="mt-1 text-sm leading-relaxed text-muted">{s.detail}</p>}
          </div>
        </li>
      ))}
    </ol>
  );
}
