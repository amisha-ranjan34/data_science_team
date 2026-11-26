export type Task = "regression" | "classification";

export interface ColumnInfo {
  name: string;
  kind: "numeric" | "categorical";
  missing_pct: number;
  unique: number;
  sample: string[];
  looks_like_id: boolean;
}

export interface Profile {
  rows: number;
  columns_count: number;
  duplicates: number;
  columns: ColumnInfo[];
  suggested_target: string;
  suggested_task: Task;
  warnings: string[];
}

export interface ModelResult {
  name: string;
  rank: number;
  complexity: number;
  cv_mean: number;
  cv_std: number;
  seconds: number;
  test: Record<string, number>;
  tuned?: boolean;
  params?: Record<string, number | string | null>;
}

export interface Step {
  id: string;
  agent: string;
  title: string;
  status: "running" | "done" | "skipped" | "error";
  detail: string;
}

export interface AiInfo {
  enabled: boolean;
  provider: string | null;
  model: string | null;
}

export interface PlanInfo {
  models: string[];
  target_transform: "none" | "log";
  rationale: string;
  source: "ai" | "default" | "what-if";
}

export interface Finding {
  severity: "high" | "medium" | "info";
  title: string;
  detail: string;
}

export interface Review {
  verdict: "pass" | "caution" | "fail";
  findings: Finding[];
  checks: string[];
}

export interface Attack {
  name: string;
  severity: "pass" | "medium" | "high";
  what: string;
  result: string;
}

export interface RedTeam {
  verdict: "pass" | "caution" | "fail";
  attacks: Attack[];
  baseline_score: number;
  metric: string;
}

export interface Artifacts {
  model: boolean;
  code: boolean;
  report: boolean;
}

export interface Result {
  task: Task;
  target: string;
  primary_metric: string;
  n_rows: number;
  n_features: number;
  split: { train: number; test: number; cv_folds: number };
  dropped_columns: { column: string; reason: string }[];
  warnings: string[];
  models: ModelResult[];
  recommendation: { model: string | null; verdict: "ok" | "no_signal"; reason: string; explanation?: string };
  plan?: PlanInfo;
  ai?: AiInfo;
  review?: Review;
  redteam?: RedTeam | null;
  artifacts?: Artifacts;
  what_if?: {
    question: string;
    parent_run_id: string;
    baseline_metric: string;
    baseline_model: string | null;
    baseline_cv_mean: number | null;
  };
}

export interface Run {
  id: string;
  filename: string;
  status: "profiled" | "running" | "done" | "error";
  progress: number;
  message: string;
  profile: Profile;
  result: Result | null;
  error: string | null;
  steps: Step[];
  parent_run_id?: string | null;
  scenario?: string | null;
}

export interface User {
  id: number;
  email: string;
}

export interface RunSummary {
  id: string;
  filename: string;
  status: "profiled" | "running" | "done" | "error";
  target: string | null;
  recommended: string | null;
  created_at: string;
}
