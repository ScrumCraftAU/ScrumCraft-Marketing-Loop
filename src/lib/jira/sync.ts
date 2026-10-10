import "server-only";
import { db } from "@/lib/supabase/server";
import { isJiraConfigured } from "@/lib/env";
import { getStatuses } from "@/lib/jira/client";
import { syncedStatus } from "@/lib/jira/status";
import type { Experiment } from "@/lib/types";

/**
 * Jira → board: reads the status of every linked Jira item and moves experiments whose
 * Jira column has changed. Runs when the Experiments board loads and at the start of each
 * loop run, so a move made in Jira shows up without touching the board.
 */
export async function syncExperimentsFromJira(): Promise<{ moved: number; error?: string }> {
  if (!isJiraConfigured()) return { moved: 0 };
  const { data, error } = await db().from("experiments").select("*").not("jira_key", "is", null).neq("status", "rejected");
  if (error) return { moved: 0, error: error.message };
  const linked = (data ?? []) as Experiment[];
  if (!linked.length) return { moved: 0 };

  let statuses;
  try {
    statuses = await getStatuses(linked.map((e) => e.jira_key!));
  } catch (err) {
    return { moved: 0, error: err instanceof Error ? err.message : String(err) };
  }

  const now = new Date().toISOString();
  let moved = 0;
  await Promise.all(
    linked.map(async (e) => {
      const s = statuses.get(e.jira_key!);
      if (!s) return;
      const next = syncedStatus(e.status, s.name, s.category);
      const patch: Record<string, unknown> = { jira_status: s.name, jira_synced_at: now };
      if (next) {
        patch.status = next;
        if (next === "running" && !e.start_date) patch.start_date = now.slice(0, 10);
        moved++;
      }
      await db().from("experiments").update(patch).eq("id", e.id);
    }),
  );
  return { moved };
}
