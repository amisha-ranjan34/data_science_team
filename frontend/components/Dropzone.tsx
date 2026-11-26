"use client";
import { useRef, useState } from "react";

interface Props { onFile: (file: File) => void; busy: boolean; }

export default function Dropzone({ onFile, busy }: Props) {
  const input = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  return (
    <section className={`relative rounded-lg border-2 border-dashed px-5 py-10 text-center transition-colors sm:px-10 ${over ? "border-volt bg-raised" : "border-line-strong bg-surface"}`} onDragOver={(e) => { e.preventDefault(); setOver(true); }} onDragLeave={() => setOver(false)} onDrop={(e) => { e.preventDefault(); setOver(false); const file = e.dataTransfer.files?.[0]; if (file) onFile(file); }}>
      <p className="eyebrow">CSV intake</p>
      <h2 className="mt-3 font-display text-3xl leading-tight sm:text-4xl">{over ? "Release to upload" : "Drop a CSV or click to browse"}</h2>
      <p className="mx-auto mt-3 max-w-lg text-base leading-relaxed text-text-2">The team will profile the file and prepare a model comparison.</p>
      <button type="button" disabled={busy} onClick={() => input.current?.click()} className="ui-button ui-button-primary mt-6">{busy ? "Profiling..." : "Choose dataset"}</button>
      <input ref={input} type="file" accept=".csv,.tsv,.txt,text/csv" className="sr-only" onChange={(e) => { const file = e.target.files?.[0]; if (file) onFile(file); e.target.value = ""; }} />
      <p className="relative mt-3 text-[12px] text-text-3">or drag and drop your file anywhere in this panel</p>
    </section>
  );
}
