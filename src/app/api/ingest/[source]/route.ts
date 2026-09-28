import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/supabase/server";
import { env, isSupabaseConfigured } from "@/lib/env";
import { extractReports, parseGa4, type Observation } from "@/lib/ingest/ga4";

export const maxDuration = 60;

/**
 * Pushers (Zapier) → daily metric values. Two payload styles:
 *
 * 1. GA4 raw report (the GA4 Zap):
 *      POST /api/ingest/ga4?property=317178274
 *      body = GA4 batchRunReports output, as-is (see src/lib/ingest/ga4.ts)
 *
 * 2. Generic flat rows (any source):
 *      POST /api/ingest/linkedin_ads
 *      { "date": "2026-09-27", "spend": 120.5, "clicks": 40 }
 *      { "date": "2026-09-27", "dimension": "Spring CSM", "metrics": { "spend": 120.5 } }
 *      [ ...either shape... ]
 *    Metric names may be short ("spend") or full keys ("linkedin_ads.spend").
 *
 * Headers: x-ingest-secret: $INGEST_SECRET, plus x-vercel-protection-bypass while SSO is on.
 * The raw payload is always kept in raw_events for replay/debugging.
 */
const Row = z
  .object({
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    dimension: z.string().optional(),
    metrics: z.record(z.string(), z.coerce.number()).optional(),
  })
  .catchall(z.unknown());

interface Ga4Property {
  site: string | null;
  name: string;
  brand: string;
}

function authorised(req: Request) {
  const given = Buffer.from(req.headers.get("x-ingest-secret") ?? "");
  const expected = Buffer.from(env.ingestSecret);
  return expected.length > 0 && given.length === expected.length && timingSafeEqual(given, expected);
}

class IngestError extends Error {
  constructor(message: string, readonly status = 400, readonly extra: Record<string, unknown> = {}) {
    super(message);
  }
}

function parseGeneric(payload: unknown, source: string, keys: Set<string>) {
  const parsed = z.array(Row).safeParse(Array.isArray(payload) ? payload : [payload]);
  if (!parsed.success) throw new IngestError("invalid payload", 400, { issues: parsed.error.issues });

  const observations: Observation[] = [];
  const unknown = new Set<string>();
  for (const row of parsed.data) {
    const { date, dimension = "", metrics, ...rest } = row;
    const values: Record<string, unknown> = metrics ?? rest;
    for (const [name, v] of Object.entries(values)) {
      const value = Number(v);
      if (v === "" || v === null || !Number.isFinite(value)) continue;
      const key = name.includes(".") ? name : `${source}.${name}`;
      if (!keys.has(key)) {
        unknown.add(name);
        continue;
      }
      observations.push({ metric_key: key, date, dimension, value });
    }
  }
  return { observations, warnings: [...unknown].map((n) => `unknown metric '${n}'`) };
}

export async function POST(req: Request, ctx: RouteContext<"/api/ingest/[source]">) {
  if (!authorised(req)) return NextResponse.json({ error: "unauthorised" }, { status: 401 });
  if (!isSupabaseConfigured()) return NextResponse.json({ error: "supabase not configured" }, { status: 503 });

  const { source } = await ctx.params;
  const supabase = db();

  const { data: src } = await supabase.from("sources").select("id, config").eq("id", source).maybeSingle();
  if (!src) return NextResponse.json({ error: `unknown source '${source}'` }, { status: 404 });

  const text = await req.text();
  let payload: unknown;
  try {
    payload = JSON.parse(text);
  } catch {
    return NextResponse.json({ error: "invalid JSON" }, { status: 400 });
  }

  const { data: raw, error: rawErr } = await supabase
    .from("raw_events")
    .insert({ source_id: source, payload })
    .select("id")
    .single();
  if (rawErr) return NextResponse.json({ error: rawErr.message }, { status: 500 });

  try {
    const { data: known } = await supabase.from("metrics").select("key").eq("source_id", source);
    const keys = new Set((known ?? []).map((m) => m.key as string));

    let result: { observations: Observation[]; warnings: string[] };
    if (source === "ga4" && extractReports(payload)) {
      const propertyId = new URL(req.url).searchParams.get("property") ?? "";
      const properties = (src.config?.properties ?? {}) as Record<string, Ga4Property>;
      const property = properties[propertyId];
      if (!property) throw new IngestError(`unknown GA4 property '${propertyId}' — add it to sources.config`);
      result = parseGa4(payload, property.site);
      result.observations = result.observations.filter((o) => keys.has(o.metric_key));
    } else {
      result = parseGeneric(payload, source, keys);
    }

    const rows = result.observations.map((o) => ({ ...o, raw_event_id: raw.id }));
    for (let i = 0; i < rows.length; i += 1000) {
      const { error } = await supabase
        .from("metric_observations")
        .upsert(rows.slice(i, i + 1000), { onConflict: "metric_key,date,dimension" });
      if (error) throw new IngestError(error.message, 500);
    }

    const now = new Date().toISOString();
    await Promise.all([
      supabase
        .from("raw_events")
        .update({ processed_at: now, error: result.warnings.length ? result.warnings.join("; ") : null })
        .eq("id", raw.id),
      supabase.from("sources").update({ last_synced_at: now, last_error: null }).eq("id", source),
    ]);
    return NextResponse.json({ stored: rows.length, warnings: result.warnings });
  } catch (err) {
    const e = err instanceof IngestError ? err : new IngestError(String(err), 500);
    await Promise.all([
      supabase.from("raw_events").update({ error: e.message }).eq("id", raw.id),
      supabase.from("sources").update({ last_error: e.message }).eq("id", source),
    ]);
    return NextResponse.json({ error: e.message, ...e.extra }, { status: e.status });
  }
}
