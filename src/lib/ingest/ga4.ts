/**
 * Turns a GA4 Data API `batchRunReports` (or single `runReport`) response into daily
 * metric observations. The Zap forwards GA4's raw output untouched; all metric
 * definitions live here so they can change without editing the Zap.
 *
 * Reports are recognised by their dimension headers, not their order:
 *   [date]                              sessions, newUsers, engagementRate
 *   [date, sessionDefaultChannelGroup]  sessions        → channel breakdown + organic
 *   [date, pagePath]                    screenPageViews → course / checkout page views
 *   [date, eventName]                   eventCount      → conversion events
 *
 * Kept dependency-free so it can be unit-tested with plain `node --test`.
 */

export interface Observation {
  metric_key: string;
  date: string; // yyyy-mm-dd
  dimension: string;
  value: number;
}

interface Report {
  dimensionHeaders?: { name: string }[];
  metricHeaders?: { name: string }[];
  rows?: { dimensionValues: { value: string }[]; metricValues: { value: string }[] }[];
  rowCount?: number;
}

/** Course & event landing pages on www.scrumcraft.com (and Ticket Tailor event pages). */
export const COURSE_PAGE =
  /^\/(courses\/|training\/?$|scrumatscale\/?$|safe_training\/?$|events\/scrumcraft(\/|$))|^\/[a-z0-9-]+-(january|february|march|april|may|june|july|august|september|october|november|december)-20\d\d\/?$/i;
export const CHECKOUT_PAGE = /^\/checkout\//i;

const TOTAL_METRICS: Record<string, string> = {
  sessions: "ga4.sessions",
  newUsers: "ga4.new_users",
  engagementRate: "ga4.engagement_rate",
};
const EVENT_METRICS: Record<string, string> = {
  form_submit: "ga4.form_submits",
};

/** The same request body is used for every property in the Zap. */
export function batchRequestBody(startDate = "42daysAgo") {
  const range = [{ startDate, endDate: "yesterday" }];
  return {
    requests: [
      { dateRanges: range, dimensions: [{ name: "date" }], metrics: [{ name: "sessions" }, { name: "newUsers" }, { name: "engagementRate" }], limit: 10000 },
      { dateRanges: range, dimensions: [{ name: "date" }, { name: "sessionDefaultChannelGroup" }], metrics: [{ name: "sessions" }], limit: 10000 },
      { dateRanges: range, dimensions: [{ name: "date" }, { name: "pagePath" }], metrics: [{ name: "screenPageViews" }], limit: 100000 },
      { dateRanges: range, dimensions: [{ name: "date" }, { name: "eventName" }], metrics: [{ name: "eventCount" }], limit: 10000 },
    ],
  };
}

/** Finds the GA4 report(s) whether Zapier sends the bare body, {status, body}, or {results:[…]}. */
export function extractReports(payload: unknown): Report[] | null {
  const seen = new Set<unknown>();
  const visit = (node: unknown): Report[] | null => {
    if (!node || typeof node !== "object" || seen.has(node)) return null;
    seen.add(node);
    const obj = node as Record<string, unknown>;
    if (Array.isArray(obj.reports)) return obj.reports as Report[];
    if (Array.isArray(obj.dimensionHeaders) || Array.isArray(obj.metricHeaders)) return [obj as Report];
    for (const key of ["body", "results", "data", "response"]) {
      const child = obj[key];
      const list = Array.isArray(child) ? child : [child];
      for (const c of list) {
        const found = visit(typeof c === "string" ? tryParse(c) : c);
        if (found) return found;
      }
    }
    return null;
  };
  return visit(typeof payload === "string" ? tryParse(payload) : payload);
}

function tryParse(s: string): unknown {
  try {
    return JSON.parse(s);
  } catch {
    return null;
  }
}

const isoDate = (d: string) => `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}`;

/**
 * @param siteKey null for the main site (stored as the total, dimension ''); otherwise
 *                observations are stored under dimension `site:<key>`.
 */
export function parseGa4(payload: unknown, siteKey: string | null): { observations: Observation[]; warnings: string[] } {
  const reports = extractReports(payload);
  if (!reports) return { observations: [], warnings: ["no GA4 reports found in payload"] };

  const warnings: string[] = [];
  const sums = new Map<string, Observation>();
  const scope = siteKey ? `site:${siteKey}` : "";
  const dim = (sub = "") => [scope, sub].filter(Boolean).join("|");
  const add = (metric_key: string, date: string, dimension: string, value: number, mode: "sum" | "set" = "sum") => {
    if (!Number.isFinite(value)) return;
    const k = `${metric_key}\u0000${date}\u0000${dimension}`;
    const cur = sums.get(k);
    if (cur && mode === "sum") cur.value += value;
    else sums.set(k, { metric_key, date, dimension, value });
  };

  for (const report of reports) {
    const dims = (report.dimensionHeaders ?? []).map((h) => h.name);
    const mets = (report.metricHeaders ?? []).map((h) => h.name);
    const rows = report.rows ?? [];
    if (report.rowCount && report.rowCount > rows.length) {
      warnings.push(`report [${dims.join(",")}] truncated: ${rows.length}/${report.rowCount} rows`);
    }
    if (dims[0] !== "date") {
      warnings.push(`skipped report without a leading date dimension: [${dims.join(",")}]`);
      continue;
    }
    const shape = dims.slice(1).join(",");

    for (const row of rows) {
      const date = isoDate(row.dimensionValues[0].value);
      const second = row.dimensionValues[1]?.value ?? "";
      const val = (metric: string) => Number(row.metricValues[mets.indexOf(metric)]?.value);

      if (shape === "") {
        for (const [name, key] of Object.entries(TOTAL_METRICS)) {
          if (mets.includes(name)) add(key, date, dim(), val(name), "set");
        }
      } else if (shape === "sessionDefaultChannelGroup" && mets.includes("sessions")) {
        add("ga4.sessions", date, dim(`channel:${second}`), val("sessions"), "set");
        if (second === "Organic Search") add("ga4.organic_sessions", date, dim(), val("sessions"), "set");
      } else if (shape === "pagePath" && mets.includes("screenPageViews")) {
        if (COURSE_PAGE.test(second)) add("ga4.course_page_views", date, dim(), val("screenPageViews"));
        if (CHECKOUT_PAGE.test(second)) add("ga4.checkout_views", date, dim(), val("screenPageViews"));
      } else if (shape === "eventName" && mets.includes("eventCount")) {
        const key = EVENT_METRICS[second];
        if (key) add(key, date, dim(), val("eventCount"));
      } else {
        warnings.push(`skipped unrecognised report [${dims.join(",")}]`);
        break;
      }
    }
  }

  // Days with sessions but no organic / conversions are real zeros, not missing data.
  const dates = new Set([...sums.values()].filter((o) => o.metric_key === "ga4.sessions" && o.dimension === dim()).map((o) => o.date));
  for (const date of dates) {
    for (const key of ["ga4.organic_sessions", "ga4.course_page_views", "ga4.checkout_views", "ga4.form_submits"]) {
      const k = `${key}\u0000${date}\u0000${dim()}`;
      if (!sums.has(k)) sums.set(k, { metric_key: key, date, dimension: dim(), value: 0 });
    }
  }

  return { observations: [...sums.values()], warnings };
}
