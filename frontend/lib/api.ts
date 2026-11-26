import type { AiInfo, Run, RunSummary, Task, User } from "./types";

const BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";
const FILE_NAMES = { model: "model.joblib", code: "train_model.py", report: "report.md" } as const;

export class AuthError extends Error {}

function csrfToken(): string | null {
  if (typeof document === "undefined") return null;
  const cookie = document.cookie.split("; ").find((value) => value.startsWith("adst_csrf="));
  return cookie ? decodeURIComponent(cookie.slice("adst_csrf=".length)) : null;
}

async function parse<T>(res: Response, authenticated = true): Promise<T> {
  if (!res.ok) {
    let detail = `Request failed (${res.status}).`;
    try {
      const body = await res.json();
      if (typeof body.detail === "string") detail = body.detail;
      else if (Array.isArray(body.detail) && body.detail[0]?.msg) detail = body.detail[0].msg;
    } catch {}
    if (res.status === 401 && authenticated) throw new AuthError(detail);
    throw new Error(detail);
  }
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

async function request(path: string, init: RequestInit = {}): Promise<Response> {
  const headers = new Headers(init.headers);
  const method = (init.method ?? "GET").toUpperCase();
  const csrf = csrfToken();
  if (csrf && !["GET", "HEAD", "OPTIONS"].includes(method)) headers.set("X-CSRF-Token", csrf);
  try {
    return await fetch(`${BASE}${path}`, { ...init, headers, credentials: "include" });
  } catch {
    throw new Error("Cannot reach the server. Check that the backend is running on " + BASE + ".");
  }
}

const json = (body: unknown): RequestInit => ({
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(body),
});

// ---- accounts
async function authenticate(path: string, email: string, password: string): Promise<User> {
  const data = await parse<{ user: User }>(await request(path, json({ email, password })), false);
  return data.user;
}
export const login = (email: string, password: string) => authenticate("/api/auth/login", email, password);
export interface VerificationResponse {
  email: string;
  message: string;
  verification_token?: string;
}
export interface ResendVerificationResponse {
  message: string;
  verification_token?: string;
}
export const register = async (email: string, password: string) =>
  parse<VerificationResponse>(await request("/api/auth/register", json({ email, password })), false);
export const verifyEmail = async (token: string) =>
  parse<{ user: User }>(await request("/api/auth/verify-email", json({ token })), false);
export const resendVerification = async (email: string) =>
  parse<ResendVerificationResponse>(await request("/api/auth/resend-verification", json({ email })), false);
export const logout = async () => parse<void>(await request("/api/auth/logout", { method: "POST" }), false);
export const getMe = async () => parse<User>(await request("/api/auth/me"));

// ---- runs
export const uploadCsv = async (file: File): Promise<Run> => {
  const form = new FormData();
  form.append("file", file);
  return parse<Run>(await request("/api/runs", { method: "POST", body: form }));
};
export const startTraining = async (id: string, target: string, task: Task): Promise<void> => {
  await parse(await request(`/api/runs/${id}/train`, json({ target, task })));
};
export const startWhatIf = async (id: string, question: string) =>
  parse<Run>(await request(`/api/runs/${id}/what-if`, json({ question })));
export const getRun = async (id: string) => parse<Run>(await request(`/api/runs/${id}`));
export const listRuns = async () => parse<RunSummary[]>(await request("/api/runs"));
export const deleteRun = async (id: string) => parse<void>(await request(`/api/runs/${id}`, { method: "DELETE" }));
export const getConfig = async (): Promise<{ ai: AiInfo }> => parse(await request("/api/config"));

/** Use fetch so the authenticated cookies are included with the download request. */
export async function downloadFile(id: string, kind: keyof typeof FILE_NAMES): Promise<void> {
  const res = await request(`/api/runs/${id}/download/${kind}`);
  if (!res.ok) await parse(res);
  const url = URL.createObjectURL(await res.blob());
  const a = document.createElement("a");
  a.href = url;
  a.download = FILE_NAMES[kind];
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

/** Live updates for a running run (server-sent events over fetch, so the login header can be sent). */
export async function streamRun(id: string, onRun: (run: Run) => void, signal: AbortSignal): Promise<void> {
  const res = await request(`/api/runs/${id}/events`, { signal, headers: { Accept: "text/event-stream" } });
  if (!res.ok || !res.body) await parse(res);
  const reader = res.body!.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) return;
    buffer += decoder.decode(value, { stream: true });
    const messages = buffer.split("\n\n");
    buffer = messages.pop() ?? "";
    for (const message of messages) {
      const data = message.split("\n").filter((l) => l.startsWith("data: ")).map((l) => l.slice(6)).join("");
      if (data && data !== "{}") onRun(JSON.parse(data) as Run);
    }
  }
}
