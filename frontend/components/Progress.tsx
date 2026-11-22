import type { Step } from "@/lib/types";
import Timeline from "./Timeline";

export default function Progress({ value, message, steps }: { value: number; message: string; steps: Step[] }) {
  const pct = Math.round(value * 100);
  return (
    <section className="rounded-2xl border border-line bg-surface p-5 sm:p-7" aria-live="polite">
      <h2 className="text-lg font-bold">The team is working</h2>
      <p className="mt-1 text-sm text-muted">{message || "Starting"}</p>
      <div className="mt-4 h-2 overflow-hidden rounded-full bg-paper" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
        <div className="h-full rounded-full bg-accent transition-[width] duration-500" style={{ width: `${Math.max(pct, 4)}%` }} />
      </div>
      <div className="mt-6 border-t border-line pt-5">
        <Timeline steps={steps} />
      </div>
    </section>
  );
}
