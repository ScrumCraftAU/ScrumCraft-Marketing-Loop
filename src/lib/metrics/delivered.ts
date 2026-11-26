import "server-only";
import { db } from "@/lib/supabase/server";

export interface DeliveredForecast {
  current: number | null; // this calendar month's projected delivered revenue
  target: number | null; // monthly target ($100k)
  months: { month: string; value: number }[]; // forward projection, oldest → newest
  asOf: string | null; // snapshot date
}

/**
 * Latest `hubspot.delivered_revenue` snapshot for the mission card: this month's projected delivered
 * revenue (dimension ''), the monthly target, and the forward month:YYYY-MM projection.
 */
export async function getDeliveredForecast(): Promise<DeliveredForecast> {
  const supabase = db();
  const [{ data: metric }, { data: latest }] = await Promise.all([
    supabase.from("metrics").select("target_value").eq("key", "hubspot.delivered_revenue").maybeSingle(),
    supabase
      .from("metric_observations")
      .select("date")
      .eq("metric_key", "hubspot.delivered_revenue")
      .eq("dimension", "")
      .order("date", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);
  const target = metric?.target_value ?? null;
  const asOf = latest?.date ?? null;
  if (!asOf) return { current: null, target, months: [], asOf: null };

  const { data: rows } = await supabase
    .from("metric_observations")
    .select("dimension, value")
    .eq("metric_key", "hubspot.delivered_revenue")
    .eq("date", asOf);

  const months = (rows ?? [])
    .filter((r) => r.dimension.startsWith("month:"))
    .map((r) => ({ month: r.dimension.slice("month:".length), value: Number(r.value) }))
    .sort((a, b) => a.month.localeCompare(b.month));
  const total = (rows ?? []).find((r) => r.dimension === "");
  const current = total ? Number(total.value) : (months[0]?.value ?? null);
  return { current, target, months, asOf };
}
