import type { AiInfo, Run, RunSummary, Task, User } from "./types";

const BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";
const TOKEN_KEY = "adst_token";
const FILE_NAMES = { model: "model.joblib", code: "train_model.py", report: "report.md" } as const;

export class AuthError extends Error {}

export const getToken = () => (typeof window === "undefined" ? null : window.localStorage.getItem(TOKEN_KEY));
const setToken = (t: string) => window.localStorage.setItem(TOKEN_KEY, t);
export const clearToken = () => window.localStorage.removeItem(TOKEN_KEY);

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
  const token = getToken();
  if (token) headers.set("Authorization", `Bearer ${token}`);
  try {
    return await fetch(`${BASE}${path}`, { ...init, headers });
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
  const data = await parse<{ token: string; user: User }>(await request(path, json({ email, password })), false);
  setToken(data.token);
  return data.user;
}
export const login = (email: string, password: string) => authenticate("/api/auth/login", email, password);
export const register = (email: string, password: string) => authenticate("/api/auth/register", email, password);
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
export const getRun = async (id: string) => parse<Run>(await request(`/api/runs/${id}`));
export const listRuns = async () => parse<RunSummary[]>(await request("/api/runs"));
export const deleteRun = async (id: string) => parse<void>(await request(`/api/runs/${id}`, { method: "DELETE" }));
export const getConfig = async (): Promise<{ ai: AiInfo }> => parse(await request("/api/config"));

/** Downloads need the login token, so they go through fetch instead of a plain link. */
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
