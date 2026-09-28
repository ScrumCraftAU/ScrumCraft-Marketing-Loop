import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/supabase/server";
import { env, isSupabaseConfigured } from "@/lib/env";

/**
 * Zapier (or any pusher) → daily metric values.
 *
 *   POST /api/ingest/ga4
 *   x-ingest-secret: $INGEST_SECRET
 *   x-vercel-protection-bypass: $VERCEL_AUTOMATION_BYPASS_SECRET   (needed while SSO is on)
 *
 *   { "date": "2026-09-27", "sessions": 412, "organic_sessions": 180 }
 *   { "date": "2026-09-27", "dimension": "Spring CSM", "metrics": { "spend": 120.5 } }
 *   [ ...either shape... ]
 *
 * Metric names may be short ("sessions") or full keys ("ga4.sessions"). Unknown names are
 * reported back, not stored. The raw payload is always kept in raw_events for replay.
 */
const Row = z
  .object({
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    dimension: z.string().optional(),
    metrics: z.record(z.string(), z.coerce.number()).optional(),
  })
  .catchall(z.unknown());

function authorised(req: Request) {
  const given = Buffer.from(req.headers.get("x-ingest-secret") ?? "");
  const expected = Buffer.from(env.ingestSecret);
  return expected.length > 0 && given.length === expected.length && timingSafeEqual(given, expected);
}

export async function POST(req: Request, ctx: RouteContext<"/api/ingest/[source]">) {
  if (!authorised(req)) return NextResponse.json({ error: "unauthorised" }, { status: 401 });
  if (!isSupabaseConfigured()) return NextResponse.json({ error: "supabase not configured" }, { status: 503 });

  const { source } = await ctx.params;
  const supabase = db();

  const { data: src } = await supabase.from("sources").select("id").eq("id", source).maybeSingle();
  if (!src) return NextResponse.json({ error: `unknown source '${source}'` }, { status: 404 });

  const payload = await req.json().catch(() => null);
  if (payload === null) return NextResponse.json({ error: "invalid JSON" }, { status: 400 });

  const { data: raw, error: rawErr } = await supabase
    .from("raw_events")
    .insert({ source_id: source, payload })
    .select("id")
    .single();
  if (rawErr) return NextResponse.json({ error: rawErr.message }, { status: 500 });

  const parsed = z.array(Row).safeParse(Array.isArray(payload) ? payload : [payload]);
  if (!parsed.success) {
    await supabase.from("raw_events").update({ error: parsed.error.message }).eq("id", raw.id);
    return NextResponse.json({ error: "invalid payload", issues: parsed.error.issues }, { status: 400 });
  }

  const { data: known } = await supabase.from("metrics").select("key").eq("source_id", source);
  const keys = new Set((known ?? []).map((m) => m.key as string));

  const rows: { metric_key: string; date: string; dimension: string; value: number; raw_event_id: string }[] = [];
  const unknown = new Set<string>();
  for (const row of parsed.data) {
    const { date, dimension = "", metrics, ...rest } = row;
    const values: Record<string, unknown> = metrics ?? rest;
    for (const [name, v] of Object.entries(values)) {
      const value = Number(v);
      if (v === "" || v === null || !Number.isFinite(value)) continue;
      const key = name.includes(".") ? name : `${source}.${name}`;
      if (!keys.has(key)) { unknown.add(name); continue; }
      rows.push({ metric_key: key, date, dimension, value, raw_event_id: raw.id });
    }
  }

  if (rows.length) {
    const { error } = await supabase
      .from("metric_observations")
      .upsert(rows, { onConflict: "metric_key,date,dimension" });
    if (error) {
      await supabase.from("raw_events").update({ error: error.message }).eq("id", raw.id);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
  }

  const now = new Date().toISOString();
  await Promise.all([
    supabase.from("raw_events").update({ processed_at: now }).eq("id", raw.id),
    supabase.from("sources").update({ last_synced_at: now, last_error: null }).eq("id", source),
  ]);

  return NextResponse.json({ stored: rows.length, unknown: [...unknown] });
}
