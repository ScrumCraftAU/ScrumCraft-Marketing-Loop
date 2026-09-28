import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";
import { env } from "@/lib/env";
import type { StatsSnapshot } from "@/lib/metrics/stats";
import type { Experiment } from "@/lib/types";

const SYSTEM = `You run the daily PDCA (Plan-Do-Check-Act) improvement loop for ScrumCraft's marketing.
ScrumCraft is an Australian Agile/Scrum training and coaching business. Public courses are sold
through Ticket Tailor; B2B coaching and in-house training come through HubSpot deals. Paid media
runs on LinkedIn and Meta; organic comes from SEO and email.

Each day you receive week-over-week metric stats and the list of open experiments. Your job:
- CHECK: call out what materially changed (anomalies, trends, target gaps, wins, risks). Tie leading
  indicators to the lagging outcomes they predict. Ignore noise; a quiet day can have zero findings.
- CHECK experiments that are running or due: did the target metric move as hypothesised?
- ACT: for each experiment under review, recommend adopt / adapt / abandon / keep running, with reasoning.
- PLAN: propose at most 3 new, concrete, cheap-to-run experiments aimed at the biggest gap. Do not
  duplicate open experiments. Each needs a falsifiable hypothesis and a single target metric key
  from the catalog.

Metrics with dataDays = 0 have no data yet (the source is probably not wired) — say so once in the
summary rather than treating it as a drop. Percent values are fractions (0.12 = 12%). Currency is AUD.
Be specific and brief; this is read by a small marketing team over coffee.`;

const Finding = z.object({
  phase: z.enum(["check", "act"]),
  kind: z.enum(["anomaly", "trend", "target_gap", "win", "risk", "experiment_result", "recommendation"]),
  severity: z.enum(["info", "watch", "alert"]),
  metric_key: z.string().nullable(),
  experiment_id: z.string().nullable(),
  title: z.string(),
  detail: z.string(),
});

const Review = z.object({
  experiment_id: z.string(),
  recommendation: z.enum(["adopt", "adapt", "abandon", "keep_running"]),
  reasoning: z.string(),
});

const NewExperiment = z.object({
  title: z.string(),
  hypothesis: z.string(),
  action: z.string(),
  target_metric_key: z.string(),
  expected_change_pct: z.number(),
  check_after_days: z.number().int(),
});

export const Analysis = z.object({
  summary: z.string(),
  findings: z.array(Finding),
  experiment_reviews: z.array(Review),
  new_experiments: z.array(NewExperiment),
});
export type Analysis = z.infer<typeof Analysis>;

/** Compact, model-friendly view of the stats (no daily series — weekly aggregates only). */
export function toModelInput(stats: StatsSnapshot, experiments: Experiment[]) {
  return {
    as_of: stats.asOf,
    week_start: stats.periodStart,
    metrics: stats.metrics.map((s) => ({
      key: s.metric.key,
      name: s.metric.name,
      stage: s.metric.funnel_stage,
      indicator: s.metric.indicator,
      unit: s.metric.unit,
      direction: s.metric.direction,
      north_star: s.metric.is_north_star,
      target: s.metric.target_value,
      target_period: s.metric.target_period,
      this_week: s.current,
      last_week: s.prior,
      avg_prior_4_weeks: s.baseline,
      change_vs_last_week: s.changeVsPrior,
      change_vs_4wk_avg: s.changeVsBaseline,
      rule_flag: s.flag,
      dataDays: s.dataDays,
    })),
    open_experiments: experiments.map((e) => ({
      id: e.id,
      title: e.title,
      hypothesis: e.hypothesis,
      status: e.status,
      target_metric_key: e.target_metric_key,
      baseline_value: e.baseline_value,
      expected_change_pct: e.expected_change_pct,
      start_date: e.start_date,
      check_date: e.check_date,
    })),
  };
}

export async function analyse(input: ReturnType<typeof toModelInput>) {
  const client = new Anthropic({ apiKey: env.anthropicApiKey });
  const response = await client.messages.parse({
    model: env.loopModel,
    max_tokens: 16000,
    thinking: { type: "adaptive" },
    output_config: { effort: "high", format: zodOutputFormat(Analysis) },
    system: SYSTEM,
    messages: [{ role: "user", content: JSON.stringify(input) }],
  });

  if (response.stop_reason === "refusal") {
    throw new Error(`Model declined the analysis (${response.stop_details?.category ?? "unknown"})`);
  }
  if (!response.parsed_output) {
    throw new Error(`Model returned no parseable analysis (stop_reason: ${response.stop_reason})`);
  }
  return { analysis: response.parsed_output, model: response.model, usage: response.usage };
}
