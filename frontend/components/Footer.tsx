export default function Footer() {
  return (
    <footer className="mt-20 border-t border-line/80 bg-surface/30 backdrop-blur-sm">
      <div className="mx-auto max-w-5xl px-4 py-10 sm:px-6">
        <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-3">
          <div>
            <div className="flex items-center gap-2">
              <div className="h-6 w-6 rounded-lg bg-gradient-to-tr from-cyan-500 to-indigo-600 grid place-items-center text-white text-xs font-bold">
                DS
              </div>
              <span className="font-extrabold tracking-tight text-white">
                Auto<span className="text-cyan-400">DS</span> Team
              </span>
            </div>
            <p className="mt-3 text-xs leading-relaxed text-muted">
              Autonomous end-to-end data science platform. Ingests raw tabular data, cleans without leakage, trains competitive models, and delivers cross-validated baseline comparisons.
            </p>
          </div>

          <div>
            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-300">Pipeline Architecture</h4>
            <div className="mt-3 flex flex-wrap gap-1.5">
              {["Data Ingestion", "Automated Profiling", "Leak-free Pipeline", "Cross-Validation", "Baseline Evaluation", "Model Selection"].map((pill) => (
                <span key={pill} className="rounded-md border border-line bg-surface px-2 py-1 text-[11px] font-medium text-slate-400">
                  {pill}
                </span>
              ))}
            </div>
          </div>

          <div>
            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-300">Core Stack</h4>
            <div className="mt-3 flex flex-wrap gap-1.5">
              {["Next.js 14", "FastAPI", "Scikit-Learn", "LightGBM", "Optuna", "Tailwind CSS"].map((tech) => (
                <span key={tech} className="rounded-md border border-cyan-500/20 bg-cyan-950/20 px-2 py-1 text-[11px] font-medium text-cyan-300">
                  {tech}
                </span>
              ))}
            </div>
            <p className="mt-4 text-[11px] text-muted">
              Built for high-signal machine learning and production deployment.
            </p>
          </div>
        </div>

        <div className="mt-8 flex flex-wrap items-center justify-between gap-4 border-t border-line/60 pt-6 text-xs text-muted">
          <p>© {new Date().getFullYear()} Auto Data Science Team. All rights reserved.</p>
          <div className="flex items-center gap-4">
            <span className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
              Engine Online
            </span>
          </div>
        </div>
      </div>
    </footer>
  );
}
