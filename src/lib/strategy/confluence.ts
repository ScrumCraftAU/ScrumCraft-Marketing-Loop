import "server-only";
import { db } from "@/lib/supabase/server";
import { env, isConfluenceConfigured } from "@/lib/env";

/** Per-doc cap so one very long page can't blow up the daily loop's cost. */
const MAX_CHARS = 60_000;

export interface StrategyDoc {
  page_id: string;
  title: string;
  url: string;
  kind: "marketing_strategy" | "product_strategy" | "brand_guide";
  content: string | null;
  version: number | null;
  fetched_at: string | null;
  active: boolean;
}

/** Confluence storage-format XHTML → readable plain text that keeps structure. */
export function storageToText(html: string): string {
  return html
    .replace(/<ac:structured-macro[^>]*ac:name="(toc|children|jira)"[\s\S]*?<\/ac:structured-macro>/g, "")
    .replace(/<h([1-6])[^>]*>/g, (_, n) => `\n\n${"#".repeat(Number(n))} `)
    .replace(/<\/h[1-6]>/g, "\n")
    .replace(/<li[^>]*>/g, "\n- ")
    .replace(/<(br|\/p|\/tr|\/div|\/blockquote)[^>]*>/g, "\n")
    .replace(/<\/t[dh]>/g, " | ")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&rsquo;|&lsquo;/g, "'")
    .replace(/&ldquo;|&rdquo;/g, '"')
    .replace(/&ndash;/g, "–")
    .replace(/&mdash;/g, "—")
    .replace(/&[a-z]+;/g, " ")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

async function fetchPage(pageId: string) {
  const auth = Buffer.from(`${env.confluenceEmail}:${env.confluenceApiToken}`).toString("base64");
  const res = await fetch(`${env.confluenceBaseUrl}/wiki/api/v2/pages/${pageId}?body-format=storage`, {
    headers: { Authorization: `Basic ${auth}`, Accept: "application/json" },
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`Confluence ${res.status} for page ${pageId}`);
  const page = (await res.json()) as { title: string; version: { number: number }; body: { storage: { value: string } } };
  return { title: page.title, version: page.version.number, text: storageToText(page.body.storage.value) };
}

/** Pulls every active doc from Confluence and stores its current text. */
export async function refreshStrategyDocs() {
  if (!isConfluenceConfigured()) throw new Error("Confluence is not configured (CONFLUENCE_EMAIL / CONFLUENCE_API_TOKEN)");
  const { data, error } = await db().from("strategy_docs").select("page_id").eq("active", true);
  if (error) throw error;

  const results = await Promise.allSettled(
    (data ?? []).map(async ({ page_id }) => {
      const page = await fetchPage(page_id);
      const content = page.text.length > MAX_CHARS ? `${page.text.slice(0, MAX_CHARS)}\n\n[truncated]` : page.text;
      const { error } = await db()
        .from("strategy_docs")
        .update({ title: page.title, version: page.version, content, fetched_at: new Date().toISOString() })
        .eq("page_id", page_id);
      if (error) throw error;
      return page_id;
    }),
  );
  const failed = results.flatMap((r) => (r.status === "rejected" ? [String(r.reason)] : []));
  return { refreshed: results.length - failed.length, failed };
}

export async function loadStrategyDocs(): Promise<StrategyDoc[]> {
  const { data, error } = await db().from("strategy_docs").select("*").eq("active", true).order("sort_order");
  if (error) throw error;
  return (data ?? []) as StrategyDoc[];
}
