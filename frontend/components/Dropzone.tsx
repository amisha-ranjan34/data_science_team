"use client";
import { useRef, useState } from "react";

interface Props { onFile: (file: File) => void; busy: boolean; }

export default function Dropzone({ onFile, busy }: Props) {
  const input = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  return (
    <section className={`relative overflow-hidden rounded-[26px] border border-dashed p-6 text-center transition-all sm:p-9 ${over ? "border-cyan-300/70 bg-cyan-300/[.07]" : "border-violet-300/25 bg-[#11162a]/65 hover:border-violet-300/50"}`} onDragOver={(e) => { e.preventDefault(); setOver(true); }} onDragLeave={() => setOver(false)} onDrop={(e) => { e.preventDefault(); setOver(false); const file = e.dataTransfer.files?.[0]; if (file) onFile(file); }}>
      <div className="pointer-events-none absolute -right-16 -top-24 h-64 w-64 rounded-full bg-violet-500/10 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-28 -left-12 h-64 w-64 rounded-full bg-cyan-500/[.08] blur-3xl" />
      <div className="relative mx-auto grid h-16 w-16 place-items-center rounded-[20px] border border-violet-300/25 bg-violet-300/[.09] text-3xl text-violet-200 shadow-[0_0_45px_rgba(139,92,246,.15)]">{busy ? <span className="animate-spin">◌</span> : "↥"}</div>
      <p className="eyebrow mt-5">Start a new experiment</p>
      <h2 className="mt-2 font-display text-2xl font-bold text-white sm:text-3xl">Bring your data. Meet your AI team.</h2>
      <p className="mx-auto mt-2 max-w-lg text-sm leading-relaxed text-slate-400">Upload a CSV and watch eight specialist agents profile, prepare, train, review and challenge your model.</p>
      <div className="mt-5 flex flex-wrap justify-center gap-2 text-[10px] font-bold uppercase tracking-wider text-slate-400"><span className="rounded-full border border-white/10 bg-white/[.035] px-3 py-1.5">CSV / TSV</span><span className="rounded-full border border-white/10 bg-white/[.035] px-3 py-1.5">Up to 20 MB</span><span className="rounded-full border border-white/10 bg-white/[.035] px-3 py-1.5">Leak-safe pipeline</span></div>
      <button type="button" disabled={busy} onClick={() => input.current?.click()} className="primary-button relative mt-7 inline-flex items-center gap-2 rounded-xl px-6 py-3 text-sm font-bold text-white disabled:cursor-not-allowed disabled:opacity-60">{busy ? "Profiling dataset…" : "Choose dataset"}<span aria-hidden>↗</span></button>
      <input ref={input} type="file" accept=".csv,.tsv,.txt,text/csv" className="sr-only" onChange={(e) => { const file = e.target.files?.[0]; if (file) onFile(file); e.target.value = ""; }} />
      <p className="relative mt-3 text-[11px] text-slate-500">or drag and drop your file anywhere in this panel</p>
    </section>
  );
}
