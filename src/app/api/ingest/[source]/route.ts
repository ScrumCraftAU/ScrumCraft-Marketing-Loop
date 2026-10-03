import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/supabase/server";
import { env, isSupabaseConfigured } from "@/lib/env";
import { extractReports, findZapierFileLink, parseGa4, type Observation } from "@/lib/ingest/ga4";

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
  retired?: boolean;
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

/**
 * Zapier swaps large API responses for a "Full Response Data" file link
 * (https://zapier.com/engine/hydrate/…). Download the report from that link.
 */
async function fetchHydratedReport(payload: unknown, rawEventId: string): Promise<unknown> {
  if (payload === "" || payload === null) {
    throw new IngestError("request body was empty — step 4's Data chip resolved to nothing; map step 3's Response Body");
  }
  const link = findZapierFileLink(payload);
  if (!link) {
    throw new IngestError("no GA4 reports found in payload — map step 3's Full Response Data (or Raw Output) into the webhook Data");
  }

  // Each GA4 call produces a new file link. Seeing one again means the Zap is posting a
  // fixed value (e.g. the setup test sample) instead of this iteration's live step 3 output.
  const { data: earlier } = await db()
    .from("raw_events")
    .select("id, payload")
    .eq("source_id", "ga4")
    .neq("id", rawEventId)
    .gte("received_at", new Date(Date.now() - 14 * 86_400_000).toISOString())
    .order("received_at", { ascending: false })
    .limit(500);
  if ((earlier ?? []).some((e) => findZapierFileLink(e.payload) === link)) {
    throw new IngestError(
      "this Zapier response file was already received — step 4 is sending a fixed value, not this loop iteration's " +
        "step 3 output (re-testing step 4 in the editor also re-sends the same sample)",
      409,
    );
  }

  const res = await fetch(link, { cache: "no-store", signal: AbortSignal.timeout(20_000) });
  if (!res.ok) throw new IngestError(`could not download Zapier response file (${res.status})`, 502);
  const body = await res.text();
  try {
    return JSON.parse(body);
  } catch {
    throw new IngestError("Zapier response file was not JSON", 502);
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

  // A failed lookup is a (retryable) database problem, not an unknown source.
  const { data: src, error: srcErr } = await supabase.from("sources").select("id, config").eq("id", source).maybeSingle();
  if (srcErr) return NextResponse.json({ error: `database unavailable: ${srcErr.message}` }, { status: 503 });
  if (!src) return NextResponse.json({ error: `unknown source '${source}'` }, { status: 404 });

  // Keep non-JSON bodies too (stored as a string) so a misconfigured Zap is debuggable.
  const text = await req.text();
  let payload: unknown;
  try {
    payload = JSON.parse(text);
  } catch {
    payload = text;
  }

  const propertyId = new URL(req.url).searchParams.get("property");
  const { data: raw, error: rawErr } = await supabase
    .from("raw_events")
    .insert({ source_id: source, payload, meta: propertyId === null ? {} : { property: propertyId } })
    .select("id")
    .single();
  if (rawErr) return NextResponse.json({ error: rawErr.message }, { status: 500 });

  try {
    const { data: known } = await supabase.from("metrics").select("key").eq("source_id", source);
    const keys = new Set((known ?? []).map((m) => m.key as string));

    let result: { observations: Observation[]; warnings: string[] };
    if (source === "ga4" && propertyId !== null) {
      const properties = (src.config?.properties ?? {}) as Record<string, Ga4Property>;
      const property = properties[propertyId];
      if (!property) throw new IngestError(`unknown GA4 property '${propertyId}' — add it to sources.config`);
      if (property.retired) {
        throw new IngestError(
          `GA4 property ${propertyId} (${property.name}) is retired — remove it from step 2 of the GA4 Zap`,
          410,
        );
      }
      const report = extractReports(payload) ? payload : await fetchHydratedReport(payload, raw.id);
      result = parseGa4(report, property.site);
      if (!result.observations.length && result.warnings.length) throw new IngestError(result.warnings.join("; "));
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
