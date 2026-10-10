"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/lib/supabase/server";
import { isConfluenceConfigured, isJiraConfigured, isSupabaseConfigured } from "@/lib/env";
import { runLoop } from "@/lib/loop/run";
import { refreshStrategyDocs } from "@/lib/strategy/confluence";
import { createExperimentStory, transitionTo } from "@/lib/jira/client";
import { WIP_LIMIT, columnOf, isActDecision, jiraTargetsFor } from "@/lib/jira/status";
import type { Experiment, ExperimentStatus } from "@/lib/types";

export async function runLoopNow() {
  if (!isSupabaseConfigured()) return { ok: false as const, error: "Supabase is not configured yet" };
  const result = await runLoop({ trigger: "manual", triggeredBy: "dashboard" });
  revalidatePath("/", "layout");
  return result;
}

export async function refreshStrategyDocsNow() {
  if (!isSupabaseConfigured()) return { ok: false as const, error: "Supabase is not configured yet" };
  if (!isConfluenceConfigured()) {
    return { ok: false as const, error: "Add CONFLUENCE_EMAIL and CONFLUENCE_API_TOKEN to the Vercel project first" };
  }
  try {
    const result = await refreshStrategyDocs();
    revalidatePath("/metrics");
    return { ok: true as const, ...result };
  } catch (err) {
    return { ok: false as const, error: err instanceof Error ? err.message : String(err) };
  }
}

const Status = z.enum(["proposed", "approved", "running", "checking", "adopted", "adapted", "abandoned", "rejected", "done"]);

/**
 * Board → Jira: moving an experiment transitions its Jira item first (so the two never
 * disagree), and approving an unlinked experiment creates its Jira story. Do and Check
 * are capped at WIP_LIMIT; Jira moves can still overfill a column, which the board flags.
 */
export async function setExperimentStatus(id: string, status: ExperimentStatus) {
  const next = Status.parse(status);
  const expId = z.uuid().parse(id);
  const { data: row, error: readErr } = await db().from("experiments").select("*").eq("id", expId).single();
  if (readErr) return { ok: false as const, error: readErr.message };
  const exp = row as Experiment;

  const target = columnOf(next);
  if ((target === "do" || target === "check") && columnOf(exp.status) !== target) {
    const { data: inCol } = await db().from("experiments").select("status").in("status", target === "do" ? ["running"] : ["checking"]);
    if ((inCol?.length ?? 0) >= WIP_LIMIT) {
      return { ok: false as const, error: `${target === "do" ? "Do" : "Check"} is at its limit of ${WIP_LIMIT}. Finish one first.` };
    }
  }

  const patch: Record<string, unknown> = { status: next };
  if (next === "running" && !exp.start_date) patch.start_date = new Date().toISOString().slice(0, 10);

  if (isJiraConfigured()) {
    try {
      if (exp.jira_key) {
        const landed = await transitionTo(exp.jira_key, jiraTargetsFor(next), { leaveIfDone: isActDecision(next) });
        if (landed) patch.jira_status = landed;
      } else if (next === "approved") {
        const h = await headers();
        const boardUrl = `${h.get("x-forwarded-proto") ?? "https"}://${h.get("host")}/experiments`;
        patch.jira_key = await createExperimentStory(exp, boardUrl);
        patch.jira_status = "Backlog";
      }
      patch.jira_synced_at = new Date().toISOString();
    } catch (err) {
      return { ok: false as const, error: `Jira: ${err instanceof Error ? err.message : String(err)}` };
    }
  }

  const { error } = await db().from("experiments").update(patch).eq("id", expId);
  if (error) return { ok: false as const, error: error.message };
  revalidatePath("/experiments");
  return { ok: true as const };
}
