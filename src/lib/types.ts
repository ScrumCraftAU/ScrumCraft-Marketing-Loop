export type FunnelStage = "awareness" | "engagement" | "conversion" | "revenue";
export type Indicator = "leading" | "lagging";
export type Unit = "count" | "aud" | "percent" | "ratio" | "position";

export interface Metric {
  key: string;
  name: string;
  description: string;
  source_id: string | null;
  funnel_stage: FunnelStage;
  indicator: Indicator;
  unit: Unit;
  direction: "up_good" | "down_good";
  aggregation: "sum" | "avg" | "last";
  formula: string | null;
  target_value: number | null;
  target_period: "week" | "month" | null;
  is_north_star: boolean;
  sort_order: number;
  active: boolean;
}

export interface Source {
  id: string;
  name: string;
  ingest_method: "zapier_webhook" | "api_pull" | "manual";
  enabled: boolean;
  last_synced_at: string | null;
  last_error: string | null;
}

export interface LoopRun {
  id: string;
  trigger: "scheduled" | "manual";
  triggered_by: string | null;
  status: "running" | "succeeded" | "failed";
  started_at: string;
  finished_at: string | null;
  period_start: string;
  period_end: string;
  summary: string | null;
  model: string | null;
  error: string | null;
}

export interface LoopFinding {
  id: string;
  loop_run_id: string;
  phase: "check" | "act";
  kind: "anomaly" | "trend" | "target_gap" | "win" | "risk" | "experiment_result" | "recommendation";
  severity: "info" | "watch" | "alert";
  metric_key: string | null;
  experiment_id: string | null;
  title: string;
  detail: string;
  created_at: string;
}

export type ExperimentStatus =
  | "proposed" | "approved" | "running" | "checking" | "adopted" | "adapted" | "abandoned" | "rejected" | "done";

export interface Experiment {
  id: string;
  created_by_run_id: string | null;
  title: string;
  hypothesis: string;
  action: string;
  target_metric_key: string | null;
  baseline_value: number | null;
  expected_change_pct: number | null;
  owner: string | null;
  status: ExperimentStatus;
  start_date: string | null;
  check_date: string | null;
  result_value: number | null;
  result_notes: string | null;
  created_at: string;
  updated_at: string;
}
