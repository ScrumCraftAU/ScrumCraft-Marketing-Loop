import "server-only";
import { env, isLearnWorldsConfigured } from "@/lib/env";
import { adelaideDay, adelaideMidnight, lastDays } from "./days";
import { paymentsToObservations, type LwPayment } from "./learnworlds";
import { defaultDayCount, recordPullError, storePull } from "./store";

const MAX_PAGES = 25; // 200 payments a page; far above our volume, but bounded
const FIRST_PULL_DAYS = 365; // Academy sales are sparse, so the first pull backfills a year as a baseline

const base = () => env.learnWorldsSchoolUrl.replace(/\/+$/, "");

/** Client-credentials access token (valid for a few hours; one per pull is enough). */
async function accessToken(): Promise<string> {
  const res = await fetch(`${base()}/oauth2/access_token`, {
    method: "POST",
    headers: { "Lw-Client": env.learnWorldsClientId, "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      data: JSON.stringify({ client_id: env.learnWorldsClientId, client_secret: env.learnWorldsClientSecret, grant_type: "client_credentials" }),
    }),
    cache: "no-store",
    signal: AbortSignal.timeout(20_000),
  });
  const body = (await res.json().catch(() => null)) as { success?: boolean; tokenData?: { access_token?: string }; errors?: { message?: string }[] } | null;
  const token = body?.tokenData?.access_token;
  if (!res.ok || !token) throw new Error(`LearnWorlds token ${res.status}: ${body?.errors?.map((e) => e.message).join("; ") || "no access token returned"}`);
  return token;
}

/**
 * Pulls LearnWorlds payments created in the last `dayCount` Adelaide days (to yesterday) and
 * stores daily Academy sales and revenue, overall and by course.
 */
export async function pullLearnWorlds(dayCount?: number): Promise<{ ok: boolean; stored: number; days: number; warnings: string[]; error?: string }> {
  if (!isLearnWorldsConfigured()) return { ok: false, stored: 0, days: 0, warnings: [], error: "LEARNWORLDS_SCHOOL_URL, LEARNWORLDS_CLIENT_ID or LEARNWORLDS_CLIENT_SECRET is not set" };
  const days = lastDays(dayCount ?? ((await defaultDayCount("learnworlds")) === 14 ? 14 : FIRST_PULL_DAYS));
  const from = Math.floor(adelaideMidnight(days[0]) / 1000);
  const to = Math.floor(adelaideMidnight(adelaideDay(adelaideMidnight(days[days.length - 1]) + 36 * 3_600_000)!) / 1000);
  const warnings: string[] = [];
  const raw: Record<string, unknown> = { days: [days[0], days[days.length - 1]] };

  try {
    const token = await accessToken();
    const payments: LwPayment[] = [];
    let page = 1, totalPages = 1;
    do {
      const qs = new URLSearchParams({ created_after: String(from), created_before: String(to - 1), items_per_page: "200", page: String(page) });
      const res = await fetch(`${base()}/v2/payments?${qs}`, {
        headers: { Authorization: `Bearer ${token}`, "Lw-Client": env.learnWorldsClientId, Accept: "application/json" },
        cache: "no-store",
        signal: AbortSignal.timeout(20_000),
      });
      // LearnWorlds answers an empty result with 404 {"error":"Payments not found"}.
      if (res.status === 404) {
        const text = await res.text();
        if (/not found/i.test(text)) break;
        throw new Error(`LearnWorlds 404 on /v2/payments: ${text.slice(0, 300)}`);
      }
      if (!res.ok) throw new Error(`LearnWorlds ${res.status} on /v2/payments: ${(await res.text()).slice(0, 300)}`);
      const body = (await res.json()) as { data?: LwPayment[]; meta?: { totalPages?: number } };
      payments.push(...(body.data ?? []));
      totalPages = body.meta?.totalPages ?? 1;
      page++;
    } while (page <= totalPages && page <= MAX_PAGES);
    if (page <= totalPages) warnings.push(`stopped after ${MAX_PAGES} pages of payments`);

    const { observations, skipped } = paymentsToObservations(payments, days);
    raw.payments = payments.map((p) => ({ id: p.id, created: p.created, paid_at: p.paid_at, price: p.price, refund_at: p.refund_at, product: p.product?.name, transaction: p.transaction_id === "Added by admin" ? "admin" : p.type }));
    raw.skipped = skipped;
    const stored = await storePull("learnworlds", observations, raw, warnings);
    return { ok: true, stored, days: days.length, warnings };
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    await recordPullError("learnworlds", raw, warnings, error);
    return { ok: false, stored: 0, days: days.length, warnings, error };
  }
}
