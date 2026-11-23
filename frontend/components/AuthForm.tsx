"use client";
import { useState } from "react";
import { login, register } from "@/lib/api";
import type { User } from "@/lib/types";

export default function AuthForm({ onDone }: { onDone: (user: User) => void }) {
  const [mode, setMode] = useState<"login" | "register">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      onDone(await (mode === "login" ? login : register)(email, password));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }

  const input = "mt-2 w-full rounded-lg border border-line bg-surface px-3 py-2.5 text-base font-normal text-ink";
  return (
    <div className="mx-auto w-full max-w-md rounded-2xl border border-line bg-surface p-6 sm:p-8">
      <div className="grid grid-cols-2 gap-1 rounded-lg border border-line bg-paper p-1" role="tablist">
        {(["login", "register"] as const).map((m) => (
          <button
            key={m}
            type="button"
            role="tab"
            aria-selected={mode === m}
            onClick={() => { setMode(m); setError(null); }}
            className={"rounded-md px-3 py-2 text-sm font-semibold transition-colors " + (mode === m ? "bg-accent text-white" : "text-muted hover:text-ink")}
          >
            {m === "login" ? "Log in" : "Create account"}
          </button>
        ))}
      </div>

      <form onSubmit={submit} className="mt-6 space-y-4">
        <label className="block text-sm font-semibold">
          Email
          <input type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} className={input} />
        </label>
        <label className="block text-sm font-semibold">
          Password
          <input
            type="password"
            required
            minLength={mode === "register" ? 8 : undefined}
            autoComplete={mode === "login" ? "current-password" : "new-password"}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className={input}
          />
          {mode === "register" && <span className="mt-1.5 block text-xs font-normal text-muted">At least 8 characters.</span>}
        </label>
        {error && <p role="alert" className="rounded-lg bg-[#FDECEA] p-3 text-sm font-medium text-danger">{error}</p>}
        <button type="submit" disabled={busy} className="w-full rounded-lg bg-accent px-5 py-3 text-base font-semibold text-white transition-colors hover:bg-accent-dark disabled:opacity-60">
          {busy ? "Please wait" : mode === "login" ? "Log in" : "Create account"}
        </button>
      </form>
    </div>
  );
}
