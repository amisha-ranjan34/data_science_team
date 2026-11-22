const STEPS = ["Upload Data", "Configure Target", "Models & Results"];

export default function Stepper({ current }: { current: number }) {
  return (
    <ol className="flex items-center gap-2 text-xs sm:gap-3" aria-label="Progress">
      {STEPS.map((label, i) => {
        const state = i < current ? "done" : i === current ? "active" : "todo";
        return (
          <li key={label} className="flex items-center gap-2" aria-current={state === "active" ? "step" : undefined}>
            <span
              className={
                "grid h-6 w-6 place-items-center rounded-full text-xs font-bold transition-all " +
                (state === "done"
                  ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/40"
                  : state === "active"
                  ? "bg-gradient-to-r from-cyan-500 to-blue-600 text-white shadow-glow-sm ring-2 ring-cyan-400/40"
                  : "border border-line bg-surface text-slate-500")
              }
            >
              {state === "done" ? (
                <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
              ) : (
                i + 1
              )}
            </span>
            <span className={(state === "active" ? "font-semibold text-white" : state === "done" ? "text-slate-300" : "text-slate-500") + " hidden md:inline"}>
              {label}
            </span>
            {i < STEPS.length - 1 && (
              <span className={"h-px w-3 sm:w-6 transition-colors " + (i < current ? "bg-cyan-500/60" : "bg-line")} aria-hidden />
            )}
          </li>
        );
      })}
    </ol>
  );
}
