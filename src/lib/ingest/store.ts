import "server-only";
import { db } from "@/lib/supabase/server";
import type { Observation } from "./ga4";

/**
 * Stores a pulled source's observations (upsert, so re-pulled days are overwritten), keeps the
 * raw summary in raw_events, and marks the source as receiving. Metrics the catalogue doesn't
 * know are skipped with a warning (the foreign key would reject them).
 */
export async function storePull(source: string, observations: Observation[], raw: Record<string, unknown>, warnings: string[]) {
  const supabase = db();
  const prefix = `${source}.`;
  const { data: known } = await supabase.from("metrics").select("key").like("key", `${prefix}%`);
  const keys = new Set((known ?? []).map((m) => m.key as string));
  const rows = observations.filter((o) => keys.has(o.metric_key));
  for (const missing of new Set(observations.filter((o) => !keys.has(o.metric_key)).map((o) => o.metric_key))) {
    warnings.push(`metric '${missing}' not in catalogue`);
  }
  for (let i = 0; i < rows.length; i += 1000) {
    const { error } = await supabase.from("metric_observations").upsert(rows.slice(i, i + 1000), { onConflict: "metric_key,date,dimension" });
    if (error) throw new Error(`storing observations: ${error.message}`);
  }
  const now = new Date().toISOString();
  const lastError = warnings.length ? warnings.join("; ") : null;
  await supabase.from("raw_events").insert({ source_id: source, payload: { ...raw, warnings }, processed_at: now, error: lastError });
  await supabase.from("sources").update({ enabled: true, last_synced_at: now, last_error: lastError }).eq("id", source);
  return rows.length;
}

/** Records a failed pull without touching last_synced_at, so the source still shows its last good data. */
export async function recordPullError(source: string, raw: Record<string, unknown>, warnings: string[], error: string) {
  const supabase = db();
  await supabase.from("raw_events").insert({ source_id: source, payload: { ...raw, warnings }, error });
  await supabase.from("sources").update({ last_error: error }).eq("id", source);
}

/** Days to pull: a 42-day backfill the first time, then the last 14 (late edits get picked up). */
export async function defaultDayCount(source: string) {
  const { count } = await db().from("metric_observations").select("id", { count: "exact", head: true }).like("metric_key", `${source}.%`);
  return count ? 14 : 42;
}
