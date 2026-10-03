import "server-only";
import { format, subDays } from "date-fns";
import { db } from "@/lib/supabase/server";

const SITE_METRICS = ["ga4.sessions", "ga4.organic_sessions", "ga4.course_page_views", "ga4.form_submits"] as const;
type SiteMetric = (typeof SITE_METRICS)[number];

export interface SiteStats {
  propertyId: string;
  name: string;
  brand: string;
  dimension: string;
  metrics: Record<SiteMetric, { current: number | null; prior: number | null; baseline: number | null }>;
}

/** Weekly totals per GA4 property (this week, last week, avg of the 4 weeks before this week). */
export async function computeSiteStats(asOfDate?: Date): Promise<SiteStats[]> {
  const asOf = asOfDate ?? subDays(new Date(), 1);
  const dates = Array.from({ length: 35 }, (_, i) => format(subDays(asOf, 34 - i), "yyyy-MM-dd"));
  const week = (w: number) => new Set(dates.slice(w * 7, w * 7 + 7)); // w=4 is this week

  const { data: src } = await db().from("sources").select("config").eq("id", "ga4").maybeSingle();
  const properties = (src?.config?.properties ?? {}) as Record<
    string,
    { site: string | null; name: string; brand: string; retired?: boolean }
  >;
  // Retired properties keep their history in the database but drop out of reporting.
  const sites = Object.entries(properties)
    .filter(([, p]) => !p.retired)
    .map(([propertyId, p]) => ({
      propertyId,
      ...p,
      dimension: p.site ? `site:${p.site}` : "",
    }));
  if (!sites.length) return [];

  const { data, error } = await db()
    .from("metric_observations")
    .select("metric_key, date, dimension, value")
    .in("metric_key", SITE_METRICS)
    .in("dimension", sites.map((s) => s.dimension))
    .gte("date", dates[0])
    .lte("date", dates[dates.length - 1]);
  if (error) throw error;

  const sum = (dimension: string, key: string, days: Set<string>) => {
    const rows = (data ?? []).filter((o) => o.dimension === dimension && o.metric_key === key && days.has(o.date));
    return rows.length ? rows.reduce((a, o) => a + Number(o.value), 0) : null;
  };

  return sites.map((s) => ({
    propertyId: s.propertyId,
    name: s.name,
    brand: s.brand,
    dimension: s.dimension,
    metrics: Object.fromEntries(
      SITE_METRICS.map((key) => {
        const base = [0, 1, 2, 3].map((w) => sum(s.dimension, key, week(w))).filter((v): v is number => v !== null);
        return [key, {
          current: sum(s.dimension, key, week(4)),
          prior: sum(s.dimension, key, week(3)),
          baseline: base.length ? base.reduce((a, b) => a + b, 0) / base.length : null,
        }];
      }),
    ) as SiteStats["metrics"],
  }));
}
