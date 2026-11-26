"use client";

import clsx from "clsx";
import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode } from "react";

export function Button({ variant = "secondary", className, children, ...props }: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "ghost";
}) {
  return <button className={clsx("ui-button", variant === "primary" ? "ui-button-primary" : variant === "ghost" ? "ui-button-ghost" : "ui-button-secondary", className)} {...props}>{children}</button>;
}

export function Badge({ children, tone = "default" }: { children: ReactNode; tone?: "default" | "volt" | "ok" | "warn" | "bad" }) {
  const colors = {
    default: "border-line text-text-2",
    volt: "border-volt text-volt",
    ok: "border-ok text-ok",
    warn: "border-warn text-warn",
    bad: "border-bad text-bad",
  };
  return <span className={clsx("ui-badge", colors[tone])}>{children}</span>;
}

export function Input({ label, helper, error, className, id, ...props }: InputHTMLAttributes<HTMLInputElement> & {
  label: string; helper?: string; error?: string;
}) {
  return (
    <label htmlFor={id} className="block">
      <span className="mb-2 block text-[13px] font-semibold text-text">{label}</span>
      <input id={id} className={clsx("ui-input", className)} aria-invalid={Boolean(error)} aria-describedby={error ? `${id}-error` : helper ? `${id}-helper` : undefined} {...props} />
      {error && <span id={`${id}-error`} role="alert" className="mt-2 block text-[13px] text-bad">{error}</span>}
      {!error && helper && <span id={`${id}-helper`} className="mt-2 block text-[13px] text-text-2">{helper}</span>}
    </label>
  );
}

export function Kbd({ children }: { children: ReactNode }) {
  return <kbd className="ui-badge border-line-strong text-text-2">{children}</kbd>;
}

export function Skeleton({ className }: { className?: string }) {
  return <div aria-hidden className={clsx("h-4 animate-pulse rounded-[4px] bg-raised", className)} />;
}
