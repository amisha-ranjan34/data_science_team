"use client";
import { FormEvent, useRef, useState } from "react";

interface Props {
  onFile: (file: File) => void;
  onUrl: (url: string) => void;
  busy: boolean;
}

const SAMPLE_DATASETS = [
  {
    name: "Titanic",
    task: "Classification",
    url: "https://raw.githubusercontent.com/datasciencedojo/datasets/master/titanic.csv",
  },
  {
    name: "California Housing",
    task: "Regression",
    url: "https://raw.githubusercontent.com/ageron/handson-ml2/master/datasets/housing/housing.csv",
  },
  {
    name: "Iris",
    task: "Classification",
    url: "https://raw.githubusercontent.com/mwaskom/seaborn-data/master/iris.csv",
  },
];

export default function Dropzone({ onFile, onUrl, busy }: Props) {
  const input = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  const [url, setUrl] = useState("");

  function handleUrlSubmit(e: FormEvent) {
    e.preventDefault();
    const trimmed = url.trim();
    if (trimmed) onUrl(trimmed);
  }

  function handleSample(sampleUrl: string) {
    setUrl(sampleUrl);
    onUrl(sampleUrl);
  }

  return (
    <div className="space-y-6">
      {/* 1. Drag & Drop File Upload Area */}
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setOver(true);
        }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setOver(false);
          const file = e.dataTransfer.files?.[0];
          if (file) onFile(file);
        }}
        className={
          "relative group flex flex-col items-center justify-center gap-5 rounded-2xl border-2 border-dashed p-8 sm:p-12 text-center transition-all duration-300 " +
          (over
            ? "border-cyan-400 bg-cyan-950/20 shadow-glow"
            : "border-line bg-surface/70 hover:border-cyan-500/40 hover:bg-surface-elevated/60 shadow-glow-card")
        }
      >
        <div className="pointer-events-none absolute inset-0 -z-10 rounded-2xl bg-gradient-to-b from-cyan-500/5 to-transparent opacity-0 transition-opacity group-hover:opacity-100" />

        {/* Upload Icon */}
        <div className="relative">
          <div className="absolute -inset-2 rounded-2xl bg-cyan-500/20 blur-md transition-all group-hover:bg-cyan-500/30" />
          <div className="relative grid h-16 w-16 place-items-center rounded-2xl border border-cyan-500/30 bg-surface-elevated text-cyan-400 shadow-md transition-transform group-hover:scale-105">
            {busy ? (
              <svg className="h-8 w-8 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
              </svg>
            ) : (
              <svg className="h-8 w-8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                <polyline points="17 8 12 3 7 8" />
                <line x1="12" y1="3" x2="12" y2="15" />
              </svg>
            )}
          </div>
        </div>

        <div className="space-y-1.5 max-w-md">
          <p className="text-xl font-bold text-white">
            {busy ? "Analyzing & profiling dataset..." : "Drop your dataset file here"}
          </p>
          <p className="text-sm text-muted">
            Drag and drop a local CSV / TSV file or browse from device
          </p>
        </div>

        {/* Badges */}
        <div className="flex flex-wrap items-center justify-center gap-2 text-xs">
          <span className="rounded-md border border-line bg-surface-elevated px-2.5 py-1 font-mono font-medium text-slate-300">
            .CSV
          </span>
          <span className="rounded-md border border-line bg-surface-elevated px-2.5 py-1 font-mono font-medium text-slate-300">
            .TSV
          </span>
          <span className="rounded-md border border-line bg-surface-elevated px-2.5 py-1 font-mono font-medium text-slate-300">
            Up to 20 MB
          </span>
        </div>

        <button
          type="button"
          disabled={busy}
          onClick={() => input.current?.click()}
          className="mt-2 inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 px-6 py-2.5 text-sm font-bold text-white shadow-glow transition-all hover:from-cyan-400 hover:to-blue-500 hover:shadow-cyan-500/40 disabled:opacity-60 disabled:cursor-not-allowed"
        >
          <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 5v14M5 12h14" />
          </svg>
          {busy ? "Uploading..." : "Choose Local File"}
        </button>

        <input
          ref={input}
          type="file"
          accept=".csv,.tsv,.txt,text/csv"
          className="sr-only"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) onFile(file);
            e.target.value = "";
          }}
        />
      </div>

      {/* 2. Divider */}
      <div className="relative flex items-center py-1">
        <div className="flex-grow border-t border-line/80" />
        <span className="flex-shrink mx-4 text-xs font-bold uppercase tracking-wider text-slate-500 font-mono">
          Or Import via Dataset Link
        </span>
        <div className="flex-grow border-t border-line/80" />
      </div>

      {/* 3. Dataset URL Section */}
      <div className="rounded-2xl border border-line bg-surface/70 p-5 sm:p-6 backdrop-blur-sm shadow-glow-card">
        <div className="flex items-center gap-2 mb-3">
          <span className="grid h-7 w-7 place-items-center rounded-lg bg-cyan-500/10 border border-cyan-500/30 text-cyan-400">
            <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
              <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
            </svg>
          </span>
          <h3 className="text-sm font-bold text-white">Import from Direct URL</h3>
        </div>

        <form onSubmit={handleUrlSubmit} className="flex flex-col sm:flex-row gap-2.5">
          <div className="relative flex-1">
            <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-500">
              <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="10" />
                <line x1="2" y1="12" x2="22" y2="12" />
                <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
              </svg>
            </div>
            <input
              type="url"
              placeholder="https://raw.githubusercontent.com/.../dataset.csv"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              disabled={busy}
              className="w-full rounded-xl border border-line bg-[#0B1120] pl-10 pr-4 py-2.5 text-xs sm:text-sm text-ink placeholder:text-slate-600 focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500 focus:outline-none"
            />
          </div>

          <button
            type="submit"
            disabled={busy || !url.trim()}
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 px-5 py-2.5 text-xs sm:text-sm font-bold text-white shadow-glow transition-all hover:from-cyan-400 hover:to-blue-500 disabled:opacity-50 disabled:cursor-not-allowed shrink-0"
          >
            {busy ? (
              <>
                <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                </svg>
                Fetching...
              </>
            ) : (
              <>
                Fetch Dataset
                <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M5 12h14M12 5l7 7-7 7" />
                </svg>
              </>
            )}
          </button>
        </form>

        {/* Quick Sample Links */}
        <div className="mt-4 flex flex-wrap items-center gap-2 pt-2 border-t border-line/50">
          <span className="text-[11px] font-semibold text-muted">Try sample:</span>
          {SAMPLE_DATASETS.map((sample) => (
            <button
              key={sample.name}
              type="button"
              disabled={busy}
              onClick={() => handleSample(sample.url)}
              className="rounded-lg border border-line bg-[#0B1120] px-2.5 py-1 text-[11px] font-medium text-cyan-300 hover:border-cyan-500/50 hover:bg-surface-elevated transition-colors disabled:opacity-50"
            >
              {sample.name} <span className="text-slate-500 text-[10px]">({sample.task})</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
