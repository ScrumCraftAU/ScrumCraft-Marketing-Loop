import "server-only";
import { addDays, format, parseISO, subMinutes } from "date-fns";
import { db } from "@/lib/supabase/server";
import { isAnthropicConfigured } from "@/lib/env";
import { computeStats } from "@/lib/metrics/stats";
import { computeSiteStats } from "@/lib/metrics/sites";
import { loadStrategyDocs } from "@/lib/strategy/confluence";
import { analyse, toModelInput } from "@/lib/loop/analyse";
import { syncExperimentsFromJira } from "@/lib/jira/sync";
import { WIP_LIMIT } from "@/lib/jira/status";
import type { Experiment } from "@/lib/types";

const OPEN_STATUSES = ["proposed", "approved", "running", "checking"] as const;

export interface RunOptions {
  trigger: "scheduled" | "manual";
  triggeredBy: string;
}

/**
 * One turn of the PDCA loop:
 *   CHECK — compute week-over-week stats, move due experiments to "checking"
 *   ACT   — model reviews experiments + findings (humans make the final call)
 *   PLAN  — model proposes new experiments (status "proposed", awaiting approval)
 *   DO    — happens in the real world; the team moves experiments to "running"
 */
export async function runLoop({ trigger, triggeredBy }: RunOptions) {
  const supabase = db();

  const { data: inFlight } = await supabase
    .from("loop_runs")
    .select("id")
    .eq("status", "running")
    .gte("started_at", subMinutes(new Date(), 10).toISOString())
    .limit(1);
  if (inFlight?.length) {
    return { ok: false as const, error: "A loop run is already in progress", runId: inFlight[0].id as string };
  }

  const stats = await computeStats();
  const { data: run, error: runErr } = await supabase
    .from("loop_runs")
    .insert({ trigger, triggered_by: triggeredBy, period_start: stats.periodStart, period_end: stats.asOf })
    .select("id")
    .single();
  if (runErr) throw runErr;
  const runId = run.id as string;

  try {
    // Pick up moves made in Jira before reasoning about the board.
    await syncExperimentsFromJira();

    // CHECK: running experiments whose check date has arrived are now due for review.
    // Experiments linked to Jira move only when their Jira item does.
    await supabase
      .from("experiments")
      .update({ status: "checking" })
      .eq("status", "running")
      .is("jira_key", null)
      .lte("check_date", stats.asOf);

    const { data: open, error: expErr } = await supabase
      .from("experiments")
      .select("*")
      .in("status", OPEN_STATUSES);
    if (expErr) throw expErr;
    const experiments = (open ?? []) as Experiment[];

    const [sites, docs] = await Promise.all([computeSiteStats(), loadStrategyDocs()]);
    // WIP: Plan (proposed + approved) holds at most WIP_LIMIT, so only propose into free slots.
    const inPlan = experiments.filter((e) => e.status === "proposed" || e.status === "approved").length;
    const maxNew = Math.max(0, WIP_LIMIT - inPlan);
    // Recently closed items (done, adopted, rejected…) so the loop doesn't re-propose them.
    const { data: closed } = await supabase
      .from("experiments")
      .select("title, status, result_notes, updated_at")
      .not("status", "in", `(${OPEN_STATUSES.join(",")})`)
      .gte("updated_at", new Date(Date.now() - 90 * 86_400_000).toISOString())
      .order("updated_at", { ascending: false })
      .limit(30);
    const input = {
      ...toModelInput(stats, experiments, sites),
      max_new_experiments: maxNew,
      recent_decisions: (closed ?? []).map((e) => ({
        title: e.title,
        outcome: e.status,
        notes: e.result_notes,
        decided: String(e.updated_at).slice(0, 10),
      })),
    };

    if (!isAnthropicConfigured()) {
      await supabase
        .from("loop_runs")
        .update({
          status: "succeeded",
          finished_at: new Date().toISOString(),
          summary: "Stats computed. AI analysis skipped — ANTHROPIC_API_KEY is not set.",
          input_snapshot: input,
        })
        .eq("id", runId);
      return { ok: true as const, runId };
    }

    const { analysis, model, usage } = await analyse(input, docs);

    const metricKeys = new Set(stats.metrics.map((s) => s.metric.key));
    const experimentIds = new Set(experiments.map((e) => e.id));
    const current = new Map(stats.metrics.map((s) => [s.metric.key, s.current]));
    const validMetric = (k: string | null) => (k && metricKeys.has(k) ? k : null);
    const validExperiment = (id: string | null) => (id && experimentIds.has(id) ? id : null);

    const findings = [
      ...analysis.findings.map((f) => ({
        ...f,
        metric_key: validMetric(f.metric_key),
        experiment_id: validExperiment(f.experiment_id),
      })),
      ...analysis.experiment_reviews
        .filter((r) => experimentIds.has(r.experiment_id))
        .map((r) => ({
          phase: "act" as const,
          kind: "experiment_result" as const,
          severity: "watch" as const,
          metric_key: null,
          experiment_id: r.experiment_id,
          title: `Recommend: ${r.recommendation.replace("_", " ")}`,
          detail: r.reasoning,
        })),
    ].map((f) => ({ ...f, loop_run_id: runId }));
    if (findings.length) {
      const { error } = await supabase.from("loop_findings").insert(findings);
      if (error) throw error;
    }

    // PLAN: new experiments land as "proposed" for the team to approve.
    const proposals = analysis.new_experiments.slice(0, maxNew).map((e) => {
      const target = validMetric(e.target_metric_key);
      return {
        created_by_run_id: runId,
        title: e.title,
        hypothesis: e.hypothesis,
        action: e.action,
        target_metric_key: target,
        baseline_value: target ? current.get(target) ?? null : null,
        expected_change_pct: e.expected_change_pct,
        check_date: format(addDays(parseISO(stats.asOf), Math.max(7, e.check_after_days)), "yyyy-MM-dd"),
      };
    });
    if (proposals.length) {
      const { error } = await supabase.from("experiments").insert(proposals);
      if (error) throw error;
    }

    await supabase
      .from("loop_runs")
      .update({
        status: "succeeded",
        finished_at: new Date().toISOString(),
        summary: analysis.summary,
        model,
        usage,
        input_snapshot: { ...input, strategy_docs: docs.filter((d) => d.content).map((d) => ({ title: d.title, version: d.version })) },
      })
      .eq("id", runId);

    return { ok: true as const, runId };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await supabase
      .from("loop_runs")
      .update({ status: "failed", finished_at: new Date().toISOString(), error: message })
      .eq("id", runId);
    return { ok: false as const, error: message, runId };
  }
}
