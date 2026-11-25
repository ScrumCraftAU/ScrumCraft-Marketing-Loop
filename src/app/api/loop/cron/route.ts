import { NextResponse } from "next/server";
import { env, isSupabaseConfigured } from "@/lib/env";
import { runLoop } from "@/lib/loop/run";

export const maxDuration = 300;

/**
 * Daily PDCA loop entry point for Vercel Cron (scheduled in vercel.json at 21:30 UTC:
 * 8:00am Adelaide in daylight time, 7:00am in standard time — always after the 6:30am
 * GA4 ingest). Vercel sends `Authorization: Bearer $CRON_SECRET`.
 *
 * Optional `?days=N` (1..365) re-pulls the last N days instead of each source's default
 * 14-day refresh, for a one-off backfill of history. Recorded as a manual run.
 */
export async function GET(req: Request) {
  if (!env.cronSecret || req.headers.get("authorization") !== `Bearer ${env.cronSecret}`) {
    return NextResponse.json({ error: "unauthorised" }, { status: 401 });
  }
  if (!isSupabaseConfigured()) return NextResponse.json({ error: "supabase not configured" }, { status: 503 });

  const daysParam = new URL(req.url).searchParams.get("days");
  const dayCount = daysParam === null ? undefined : Number(daysParam);
  if (dayCount !== undefined && (!Number.isInteger(dayCount) || dayCount < 1 || dayCount > 365)) {
    return NextResponse.json({ error: "days must be an integer between 1 and 365" }, { status: 400 });
  }

  const result = await runLoop({
    trigger: dayCount === undefined ? "scheduled" : "manual",
    triggeredBy: dayCount === undefined ? "vercel-cron" : `backfill-${dayCount}d`,
    dayCount,
  });
  return NextResponse.json(result, { status: result.ok ? 200 : 500 });
}
