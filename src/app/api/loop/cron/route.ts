import { NextResponse } from "next/server";
import { env, isSupabaseConfigured } from "@/lib/env";
import { runLoop } from "@/lib/loop/run";

export const maxDuration = 300;

/**
 * Daily PDCA loop entry point for Vercel Cron (not scheduled yet — add a `crons` entry
 * to vercel.json when we're ready). Vercel sends `Authorization: Bearer $CRON_SECRET`.
 */
export async function GET(req: Request) {
  if (!env.cronSecret || req.headers.get("authorization") !== `Bearer ${env.cronSecret}`) {
    return NextResponse.json({ error: "unauthorised" }, { status: 401 });
  }
  if (!isSupabaseConfigured()) return NextResponse.json({ error: "supabase not configured" }, { status: 503 });

  const result = await runLoop({ trigger: "scheduled", triggeredBy: "vercel-cron" });
  return NextResponse.json(result, { status: result.ok ? 200 : 500 });
}
