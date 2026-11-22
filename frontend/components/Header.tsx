"use client";
import Stepper from "@/components/Stepper";

interface HeaderProps {
  step: number;
  hasRun: boolean;
  onReset: () => void;
}

export default function Header({ step, hasRun, onReset }: HeaderProps) {
  return (
    <header className="border-b border-line/80 bg-surface/50 backdrop-blur-md sticky top-0 z-30 transition-colors">
      <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-4 px-4 py-4 sm:px-6">
        {/* Brand */}
        <div className="flex items-center gap-3">
          <button onClick={onReset} className="flex items-center gap-3 text-left group">
            <div className="grid h-10 w-10 place-items-center rounded-xl bg-gradient-to-tr from-cyan-500 to-indigo-600 text-white shadow-glow transition-transform group-hover:scale-105">
              <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" />
              </svg>
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-lg font-black tracking-tight text-white group-hover:text-cyan-400 transition-colors">
                  Auto<span className="text-cyan-400">DS</span>
                </span>
                <span className="rounded-full bg-cyan-500/10 border border-cyan-500/30 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-cyan-300">
                  Team Engine
                </span>
              </div>
              <p className="text-xs text-muted">Auto Data Science Team</p>
            </div>
          </button>
        </div>

        {/* Stepper */}
        <div className="flex items-center gap-4">
          <Stepper current={step} />

          {hasRun && (
            <button
              onClick={onReset}
              title="Start a new run"
              className="hidden sm:inline-flex items-center gap-1.5 rounded-lg border border-line bg-surface-elevated px-3 py-1.5 text-xs font-semibold text-muted hover:border-cyan-500/40 hover:text-ink hover:bg-surface-hover transition-colors"
            >
              <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8" />
                <path d="M21 3v5h-5" />
                <path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16" />
                <path d="M8 16H3v5" />
              </svg>
              Start Over
            </button>
          )}
        </div>
      </div>
    </header>
  );
}
