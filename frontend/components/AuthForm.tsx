"use client";
import { useState } from "react";
import { login, register, resendVerification, verifyEmail } from "@/lib/api";
import type { User } from "@/lib/types";

export default function AuthForm({ onDone }: { onDone: (user: User) => void }) {
  const [mode, setMode] = useState<"login" | "register">("login");
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [verificationEmail, setVerificationEmail] = useState<string | null>(null);
  const [verificationToken, setVerificationToken] = useState("");
  const [devCodeAvailable, setDevCodeAvailable] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      if (mode === "login") {
        const user = await login(email, password);
        const name = displayName.trim();
        if (name) window.localStorage.setItem("autods-display-name", name);
        onDone(user);
      } else {
        const result = await register(email, password);
        setVerificationEmail(result.email);
        setVerificationToken(result.verification_token ?? "");
        setDevCodeAvailable(Boolean(result.verification_token));
        setNotice(result.verification_token
          ? `Enter the development verification code for ${result.email}.`
          : `${result.message} Sent to ${result.email}.`);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "Something went wrong.";
      if (mode === "login" && message.toLowerCase().includes("verify your email")) {
        setVerificationEmail(email.trim());
        setDevCodeAvailable(false);
        setNotice("This account needs verification. Resend a verification email to continue.");
      } else {
        setError(message);
      }
    } finally {
      setBusy(false);
    }
  }

  async function submitVerification(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const { user } = await verifyEmail(verificationToken.trim());
      const name = displayName.trim();
      if (name) window.localStorage.setItem("autods-display-name", name);
      onDone(user);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Email verification failed.");
    } finally {
      setBusy(false);
    }
  }

  async function resend() {
    if (!verificationEmail) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const result = await resendVerification(verificationEmail);
      setVerificationToken(result.verification_token ?? "");
      setDevCodeAvailable(Boolean(result.verification_token));
      setNotice(result.verification_token
        ? "A new development verification code is ready."
        : result.message);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not resend the verification email.");
    } finally {
      setBusy(false);
    }
  }

  const input = "mt-2 w-full h-12 rounded-lg border border-line-strong bg-bg px-3 text-base text-text outline-none focus:border-volt";
  return (
    <div className="w-full">
      {verificationEmail ? (
        <form onSubmit={submitVerification} className="space-y-5">
          <div>
            <p className="text-sm font-semibold">Verify your email address</p>
            <p className="mt-2 text-sm text-text-2">{notice}</p>
          </div>
          {devCodeAvailable && (
            <label className="block text-[13px] font-semibold text-text">
              Development verification code
              <input
                type="text"
                required
                autoComplete="one-time-code"
                value={verificationToken}
                onChange={(e) => setVerificationToken(e.target.value)}
                className={input}
                placeholder="Verification code"
              />
            </label>
          )}
          {error && <p role="alert" className="border-l border-accent pl-3 text-sm font-medium text-[var(--error)]">{error}</p>}
          {devCodeAvailable && (
            <button type="submit" disabled={busy} className="ui-button ui-button-primary flex w-full items-center justify-between disabled:opacity-60">
              <span>{busy ? "Verifying..." : "Verify email"}</span><span aria-hidden>-&gt;</span>
            </button>
          )}
          <div className="flex justify-between text-sm">
            <button type="button" disabled={busy} onClick={resend} className="font-semibold text-volt hover:underline">Resend email</button>
            <button type="button" onClick={() => { setVerificationEmail(null); setError(null); setNotice(null); }} className="text-text-2 hover:text-text">Back to sign in</button>
          </div>
        </form>
      ) : (
      <>
      <div className="flex gap-6 border-b border-line" role="tablist">
        {(["login", "register"] as const).map((m) => (
          <button
            key={m}
            type="button"
            role="tab"
            aria-selected={mode === m}
            onClick={() => { setMode(m); setError(null); setNotice(null); }}
            className={"relative px-1 pb-3 text-[13px] font-semibold " + (mode === m ? "text-text after:absolute after:inset-x-0 after:-bottom-px after:h-0.5 after:bg-volt" : "text-text-2 hover:text-text")}
          >
            {m === "login" ? "Log in" : "Create account"}
          </button>
        ))}
      </div>

      <form onSubmit={submit} className="mt-8 space-y-5">
        <label className="block text-[13px] font-semibold text-text">
          01 Username
          <input
            type="text"
            required
            maxLength={40}
            autoComplete="nickname"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            className={input}
            placeholder="What should we call you?"
          />
        </label>
        <label className="block text-[13px] font-semibold text-text">
          02 Email
          <input type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} className={input} />
        </label>
        <label className="block text-[13px] font-semibold text-text">
          03 Password
          <div className="relative">
            <input
              type={showPassword ? "text" : "password"}
              required
              minLength={mode === "register" ? 8 : undefined}
              autoComplete={mode === "login" ? "current-password" : "new-password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className={input}
            />
            <button type="button" onClick={() => setShowPassword((value) => !value)} className="absolute right-3 top-1/2 -translate-y-1/2 text-[13px] font-semibold text-text-2 hover:text-volt" aria-label={showPassword ? "Hide password" : "Show password"}>
              {showPassword ? "Hide" : "Show"}
            </button>
          </div>
          {mode === "register" && <span className="mt-2 block text-[13px] text-text-2">At least 8 characters.</span>}
        </label>
        {error && <p role="alert" className="border-l border-accent pl-3 text-sm font-medium text-[var(--error)]">{error}</p>}
        {notice && <p role="status" className="text-sm text-text-2">{notice}</p>}
        <button type="submit" disabled={busy} className="ui-button ui-button-primary flex w-full items-center justify-between disabled:opacity-60">
          <span>{busy ? "Authenticating..." : mode === "login" ? "Log in" : "Create account"}</span><span aria-hidden>-&gt;</span>
        </button>
      </form>
      </>
      )}
    </div>
  );
}
