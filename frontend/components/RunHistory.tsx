import type { RunSummary } from "@/lib/types";

const STATUS = {
  done: { label: "Done" },
  running: { label: "Running" },
  error: { label: "Failed" },
  profiled: { label: "Not trained" },
} as const;

export default function RunHistory({ items, onOpen, onDelete }: { items: RunSummary[]; onOpen: (id: string) => void; onDelete: (id: string) => void }) {
  if (items.length === 0) return null;
  return (
    <div aria-labelledby="history-title">
      <div className="grid grid-cols-[3rem_minmax(0,1.5fr)_minmax(0,1fr)_7rem_8rem] gap-3 border-y border-line py-3 text-[13px] font-semibold text-text-2 max-sm:hidden">
        <span>No.</span><span>File</span><span>Target</span><span>Status</span><span>Date</span>
      </div>
      <ul>
        {items.map((r, index) => {
          const s = STATUS[r.status];
          return (
            <li key={r.id} className="grid grid-cols-[3rem_minmax(0,1fr)_7rem] items-center gap-3 border-b border-line py-4 transition-colors hover:bg-raised sm:grid-cols-[3rem_minmax(0,1.5fr)_minmax(0,1fr)_7rem_8rem]">
              <span className="text-[13px] text-text-3">{String(index + 1).padStart(2, "0")}</span>
              <button onClick={() => onOpen(r.id)} className="min-w-0 text-left">
                <span className="block truncate font-semibold">{r.filename}</span>
                <span className="mt-1 block truncate text-[13px] text-text-2">{r.recommended ?? "No verdict"}</span>
              </button>
              <span className="hidden truncate text-[13px] text-text-2 sm:block">{r.target ?? "—"}</span>
              <span className={"text-[13px] font-semibold " + (r.status === "running" ? "text-volt" : "text-text-2")}>{s.label}</span>
              <button onClick={() => onDelete(r.id)} disabled={r.status === "running"} aria-label={`Delete ${r.filename}`} className="hidden text-[13px] font-semibold text-text-2 hover:text-bad disabled:opacity-40 sm:block">Delete</button>
              <span className="col-start-2 text-[13px] text-text-3 sm:hidden">{new Date(r.created_at + "Z").toLocaleDateString()}</span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
