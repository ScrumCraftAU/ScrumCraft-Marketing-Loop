import "server-only";
import { env, isMetaAdsConfigured } from "@/lib/env";
import { lastDays } from "./days";
import { insightsToObservations, type MetaInsightRow } from "./meta-ads";
import { defaultDayCount, recordPullError, storePull } from "./store";

const API = "https://graph.facebook.com/v26.0"; // check Meta's changelog when a version retires
const MAX_PAGES = 20; // 500 rows a page; far above one row per day
const FIRST_PULL_DAYS = 365; // ad history is sparse, so the first pull backfills a year as a baseline
const FIELDS = "spend,impressions,reach,clicks,actions,account_currency";

const nextDay = (day: string) => {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
};

/** All pages of one insights report. The token goes in a header and paging uses the cursor, so it never appears in a URL or an error. */
async function insights(account: string, since: string, until: string, breakdowns?: string) {
  const rows: (MetaInsightRow & { account_currency?: string })[] = [];
  let after: string | undefined;
  for (let page = 0; page < MAX_PAGES; page++) {
    const qs = new URLSearchParams({ level: "account", time_increment: "1", fields: FIELDS, limit: "500", time_range: JSON.stringify({ since, until }) });
    if (breakdowns) qs.set("breakdowns", breakdowns);
    if (after) qs.set("after", after);
    const res = await fetch(`${API}/${account}/insights?${qs}`, {
      headers: { Authorization: `Bearer ${env.metaAdsAccessToken}` },
      cache: "no-store",
      signal: AbortSignal.timeout(30_000),
    });
    const body = (await res.json().catch(() => null)) as { data?: MetaInsightRow[]; paging?: { next?: string; cursors?: { after?: string } }; error?: { message?: string; code?: number } } | null;
    if (!res.ok || !body?.data) throw new Error(`Meta ${res.status} on ${account}: ${body?.error?.message?.slice(0, 300) ?? "no data returned"}`);
    rows.push(...body.data);
    after = body.paging?.next ? body.paging.cursors?.after : undefined;
    if (!after) return rows;
  }
  throw new Error(`Meta: stopped after ${MAX_PAGES} pages of insights on ${account}`);
}

/**
 * Pulls Meta ad insights for the last `dayCount` Adelaide days (to yesterday) and stores daily
 * spend, impressions, reach, clicks and conversions, overall and per platform.
 * META_AD_ACCOUNT_ID may list several accounts, separated by commas.
 */
export async function pullMetaAds(dayCount?: number): Promise<{ ok: boolean; stored: number; days: number; warnings: string[]; error?: string }> {
  if (!isMetaAdsConfigured()) return { ok: false, stored: 0, days: 0, warnings: [], error: "META_ADS_ACCESS_TOKEN or META_AD_ACCOUNT_ID is not set" };
  const days = lastDays(dayCount ?? ((await defaultDayCount("meta_ads")) === 14 ? 14 : FIRST_PULL_DAYS));
  const since = days[0];
  // Sources disagree on whether "until" includes that day, so ask one day further and keep only `days`.
  const until = nextDay(days[days.length - 1]);
  const warnings: string[] = [];
  const raw: Record<string, unknown> = { days: [days[0], days[days.length - 1]] };

  try {
    const accounts = env.metaAdAccountId.split(",").map((a) => a.trim()).filter(Boolean).map((a) => (a.startsWith("act_") ? a : `act_${a}`));
    const totals: MetaInsightRow[] = [];
    const platforms: MetaInsightRow[] = [];
    for (const account of accounts) {
      const rows = await insights(account, since, until);
      for (const currency of new Set(rows.map((r) => r.account_currency).filter(Boolean))) {
        if (currency!.toLowerCase() !== "aud") warnings.push(`${account} reports in ${currency}, counted as AUD`);
      }
      totals.push(...rows);
      platforms.push(...(await insights(account, since, until, "publisher_platform")));
    }
    raw.accounts = accounts.length;
    raw.rows = { totals: totals.length, platforms: platforms.length };
    raw.spend = totals.reduce((sum, r) => sum + Number(r.spend ?? 0), 0);
    const stored = await storePull("meta_ads", insightsToObservations(totals, platforms, days), raw, warnings);
    return { ok: true, stored, days: days.length, warnings };
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    await recordPullError("meta_ads", raw, warnings, error);
    return { ok: false, stored: 0, days: days.length, warnings, error };
  }
}
