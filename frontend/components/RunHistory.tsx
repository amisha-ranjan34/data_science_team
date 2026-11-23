import type { RunSummary } from "@/lib/types";

const STATUS = {
  done: { label: "Done", cls: "bg-good text-white" },
  running: { label: "Running", cls: "bg-accent text-white" },
  error: { label: "Failed", cls: "bg-danger text-white" },
  profiled: { label: "Not trained", cls: "bg-paper text-muted" },
} as const;

export default function RunHistory({ items, onOpen, onDelete }: { items: RunSummary[]; onOpen: (id: string) => void; onDelete: (id: string) => void }) {
  if (items.length === 0) return null;
  return (
    <section aria-labelledby="history-title">
      <h2 id="history-title" className="text-lg font-bold">Your earlier runs</h2>
      <ul className="mt-3 divide-y divide-line overflow-hidden rounded-xl border border-line bg-surface">
        {items.map((r) => {
          const s = STATUS[r.status];
          return (
            <li key={r.id} className="flex items-center gap-3 px-4 py-3">
              <button onClick={() => onOpen(r.id)} className="min-w-0 flex-1 text-left">
                <span className="block truncate font-semibold">{r.filename}</span>
                <span className="block truncate text-sm text-muted">
                  {new Date(r.created_at + "Z").toLocaleString()}
                  {r.target ? ` · predicting ${r.target}` : ""}
                  {r.recommended ? ` · ${r.recommended}` : ""}
                </span>
              </button>
              <span className={"shrink-0 rounded-full px-2.5 py-0.5 text-xs font-bold " + s.cls}>{s.label}</span>
              <button
                onClick={() => onDelete(r.id)}
                disabled={r.status === "running"}
                aria-label={`Delete ${r.filename}`}
                className="shrink-0 text-sm font-semibold text-muted transition-colors hover:text-danger disabled:opacity-40"
              >
                Delete
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
