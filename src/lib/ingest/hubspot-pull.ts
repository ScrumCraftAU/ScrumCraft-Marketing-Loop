import "server-only";
import { env, isHubSpotConfigured } from "@/lib/env";
import type { Observation } from "./ga4";
import { adelaideDay, adelaideMidnight, lastDays } from "./days";
import { countByDay, countByDayAndDimension, parseEmailHistogram, sumByDay } from "./hubspot";
import { defaultDayCount, recordPullError, storePull } from "./store";

const API = "https://api.hubapi.com";
const SEARCH_PAGE = 200;
const SEARCH_CAP = 10_000; // HubSpot search returns at most 10,000 results per query

async function hubspot<T>(path: string, init: RequestInit = {}, attempt = 0): Promise<T> {
  const res = await fetch(`${API}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${env.hubspotAccessToken}`, "Content-Type": "application/json", ...init.headers },
    cache: "no-store",
    signal: AbortSignal.timeout(20_000),
  });
  // Search endpoints allow about 5 requests a second; back off and retry on 429.
  if (res.status === 429 && attempt < 4) {
    await new Promise((r) => setTimeout(r, 1100 * (attempt + 1)));
    return hubspot<T>(path, init, attempt + 1);
  }
  if (!res.ok) throw new Error(`HubSpot ${res.status} on ${path.split("?")[0]}: ${(await res.text()).slice(0, 300)}`);
  return (await res.json()) as T;
}

interface SearchResult {
  total: number;
  results: { id: string; properties: Record<string, string | null> }[];
  paging?: { next?: { after?: string } };
}

type Filter = { propertyName: string; operator: string; value?: string; highValue?: string };

const between = (prop: string, from: number, to: number): Filter => ({ propertyName: prop, operator: "BETWEEN", value: String(from), highValue: String(to - 1) });

/** All records matching the filters (paged), with the given properties. */
async function searchAll(object: string, filters: Filter[], properties: string[], warnings: string[]) {
  const out: SearchResult["results"] = [];
  let after: string | undefined;
  do {
    const page = await hubspot<SearchResult>(`/crm/v3/objects/${object}/search`, {
      method: "POST",
      body: JSON.stringify({ filterGroups: [{ filters }], properties, limit: SEARCH_PAGE, ...(after ? { after } : {}) }),
    });
    out.push(...page.results);
    after = page.paging?.next?.after;
    if (out.length >= SEARCH_CAP) {
      warnings.push(`${object} search hit HubSpot's ${SEARCH_CAP} result cap; counts may be low`);
      break;
    }
  } while (after);
  return out;
}

/** Number of records matching the filters (one request, no paging). */
async function countOnly(object: string, filters: Filter[]) {
  const page = await hubspot<SearchResult>(`/crm/v3/objects/${object}/search`, {
    method: "POST",
    body: JSON.stringify({ filterGroups: [{ filters }], properties: ["hs_object_id"], limit: 1 }),
  });
  return page.total;
}

/**
 * Pulls the last `dayCount` Adelaide days of HubSpot funnel and email numbers and stores them
 * as daily observations (dimension ''). Re-pulling a day overwrites it, so late edits in HubSpot
 * (a deal's close date, a lifecycle backfill) are picked up on later runs.
 */
export async function pullHubSpot(dayCount?: number): Promise<{ ok: boolean; stored: number; days: number; warnings: string[]; error?: string }> {
  if (!isHubSpotConfigured()) return { ok: false, stored: 0, days: 0, warnings: [], error: "HUBSPOT_ACCESS_TOKEN is not set" };
  const days = lastDays(dayCount ?? (await defaultDayCount("hubspot")));
  const from = adelaideMidnight(days[0]);
  const to = adelaideMidnight(adelaideDay(adelaideMidnight(days[days.length - 1]) + 36 * 3_600_000)!); // midnight after the last day
  const warnings: string[] = [];
  const observations: Observation[] = [];
  const raw: Record<string, unknown> = { days: [days[0], days[days.length - 1]] };

  try {
    // New contacts can arrive in bulk imports, so count per day instead of listing them.
    const perDay: number[] = [];
    for (const day of days) {
      const start = adelaideMidnight(day);
      const end = adelaideMidnight(adelaideDay(start + 36 * 3_600_000)!); // midnight of the next day
      perDay.push(await countOnly("contacts", [between("createdate", start, end)]));
    }
    days.forEach((date, i) => observations.push({ metric_key: "hubspot.new_contacts", date, dimension: "", value: perDay[i] }));
    raw.new_contacts = perDay;

    const mqls = await searchAll("contacts", [between("hs_v2_date_entered_marketingqualifiedlead", from, to)], ["hs_v2_date_entered_marketingqualifiedlead"], warnings);
    observations.push(...countByDay(mqls, "hs_v2_date_entered_marketingqualifiedlead", days, "hubspot.mqls"));
    const sqls = await searchAll("contacts", [between("hs_v2_date_entered_salesqualifiedlead", from, to)], ["hs_v2_date_entered_salesqualifiedlead"], warnings);
    observations.push(...countByDay(sqls, "hs_v2_date_entered_salesqualifiedlead", days, "hubspot.sqls"));
    raw.mqls = mqls.length;
    raw.sqls = sqls.length;

    // Academy (LearnWorlds) enrolments: contacts the LearnWorlds sync creates, by course. Existing
    // contacts who enrol again aren't counted (HubSpot keeps no enrolment date for them).
    const enrolled = await searchAll(
      "contacts",
      [between("createdate", from, to), { propertyName: "hs_object_source_detail_1", operator: "EQ", value: "LearnWorlds" }],
      ["createdate", "last_course_booked"],
      warnings,
    );
    observations.push(...countByDay(enrolled, "createdate", days, "hubspot.academy_enrolments"));
    observations.push(...countByDayAndDimension(enrolled, "createdate", "last_course_booked", days, "hubspot.academy_enrolments", "course"));
    raw.academy_enrolments = enrolled.length;

    const created = await searchAll("deals", [between("createdate", from, to)], ["createdate"], warnings);
    observations.push(...countByDay(created, "createdate", days, "hubspot.deals_created"));
    const won = await searchAll(
      "deals",
      [between("closedate", from, to), { propertyName: "hs_is_closed_won", operator: "EQ", value: "true" }],
      ["closedate", "amount_in_home_currency", "dealname"],
      warnings,
    );
    observations.push(...countByDay(won, "closedate", days, "hubspot.deals_won"));
    observations.push(...sumByDay(won, "closedate", "amount_in_home_currency", days, "hubspot.won_revenue"));
    raw.deals_created = created.length;
    raw.deals_won = won.map((d) => ({ id: d.id, closedate: d.properties.closedate, amount: d.properties.amount_in_home_currency }));

    try {
      const qs = new URLSearchParams({ interval: "DAY", startTimestamp: new Date(from).toISOString(), endTimestamp: new Date(to).toISOString() });
      const histogram = await hubspot<unknown>(`/marketing/v3/emails/statistics/histogram?${qs}`);
      raw.email_histogram = histogram;
      const parsed = parseEmailHistogram(histogram, days);
      observations.push(...parsed.observations);
      warnings.push(...parsed.warnings);
    } catch (err) {
      // Email stats need the "content" scope; keep the CRM numbers even if this part fails.
      warnings.push(`marketing email stats: ${err instanceof Error ? err.message : String(err)}`);
    }

    const stored = await storePull("hubspot", observations, raw, warnings);
    return { ok: true, stored, days: days.length, warnings };
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    await recordPullError("hubspot", raw, warnings, error);
    return { ok: false, stored: 0, days: days.length, warnings, error };
  }
}
