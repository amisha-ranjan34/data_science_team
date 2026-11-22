import type { AiInfo, Run, Task } from "./types";

const BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

async function parse<T>(res: Response): Promise<T> {
  if (!res.ok) {
    let detail = `Request failed (${res.status}).`;
    try {
      const body = await res.json();
      if (typeof body.detail === "string") detail = body.detail;
    } catch {}
    throw new Error(detail);
  }
  return res.json() as Promise<T>;
}

async function request(url: string, init?: RequestInit): Promise<Response> {
  try {
    return await fetch(url, init);
  } catch {
    throw new Error("Cannot reach the server. Check that the backend is running on " + BASE + ".");
  }
}

export async function uploadCsv(file: File): Promise<Run> {
  const form = new FormData();
  form.append("file", file);
  return parse<Run>(await request(`${BASE}/api/runs`, { method: "POST", body: form }));
}

export async function startTraining(id: string, target: string, task: Task): Promise<void> {
  await parse(
    await request(`${BASE}/api/runs/${id}/train`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ target, task }),
    })
  );
}

export async function getRun(id: string): Promise<Run> {
  return parse<Run>(await request(`${BASE}/api/runs/${id}`));
}

export async function getConfig(): Promise<{ ai: AiInfo }> {
  return parse(await request(`${BASE}/api/config`));
}

export const downloadUrl = (id: string, kind: "model" | "code" | "report") => `${BASE}/api/runs/${id}/download/${kind}`;
