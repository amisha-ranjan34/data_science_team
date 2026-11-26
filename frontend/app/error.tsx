"use client";

export default function ErrorPage({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main className="grid min-h-screen place-items-center px-6">
      <div className="max-w-xl border-t border-ink pt-5">
        <p className="eyebrow">Working paper / interrupted</p>
        <h1 className="mt-5 font-display text-4xl leading-tight">The run broke.</h1>
        <button type="button" onClick={reset} className="ink-button mt-8 px-5 py-4">Try again <span className="ml-8" aria-hidden>-&gt;</span></button>
      </div>
    </main>
  );
}
