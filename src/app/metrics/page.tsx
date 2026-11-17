import { formatDistanceToNow, parseISO, subDays } from "date-fns";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { NotConfigured } from "@/components/not-configured";
import { isSupabaseConfigured } from "@/lib/env";
import { db } from "@/lib/supabase/server";
import type { Metric, Source } from "@/lib/types";
import type { StrategyDoc } from "@/lib/strategy/confluence";
import { RefreshDocsButton } from "@/components/refresh-docs-button";
import { BackfillHubSpotButton, PullSourceButton } from "@/components/pull-source-button";
import { FRESH_WINDOW_DAYS, isOnline } from "@/lib/metrics/freshness";
import { cn } from "@/lib/utils";

/** Online: data in the last FRESH_WINDOW_DAYS days (every input, for derived metrics). */
function OnlineLozenge({ online, latest }: { online: boolean; latest?: string }) {
  return (
    <span
      title={latest ? `Latest data ${latest}` : `No data in the last ${FRESH_WINDOW_DAYS} days`}
      className={cn(
        "inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-bold text-primary",
        online ? "bg-good/25" : "bg-bad/15",
      )}
    >
      <span className={cn("size-1.5 rounded-full", online ? "bg-good" : "bg-bad")} aria-hidden />
      {online ? "Online" : "Offline"}
    </span>
  );
}

const CAMPAIGN_DAYS = 7;

/** UTM campaign × button rows ("site:academy|campaign:x|content:y") summed over the window, most sessions first. */
function topCampaigns(rows: { metric_key: string; dimension: string; value: number | string }[]) {
  const byKey = new Map<string, { site: string; campaign: string; button: string; sessions: number; keyEvents: number }>();
  for (const r of rows) {
    const parts = Object.fromEntries(r.dimension.split("|").map((p) => [p.slice(0, p.indexOf(":")), p.slice(p.indexOf(":") + 1)]));
    if (!parts.campaign) continue;
    const cur = byKey.get(r.dimension) ?? { site: parts.site ?? "main", campaign: parts.campaign, button: parts.content ?? "—", sessions: 0, keyEvents: 0 };
    if (r.metric_key === "ga4.campaign_sessions") cur.sessions += Number(r.value);
    else cur.keyEvents += Number(r.value);
    byKey.set(r.dimension, cur);
  }
  return [...byKey.values()].sort((a, b) => b.sessions - a.sessions).slice(0, 20);
}

const EMAIL_DAYS = 28;
const EMAIL_KEYS = { "hubspot.emails_sent": "sent", "hubspot.emails_delivered": "delivered", "hubspot.email_opens": "opens", "hubspot.email_clicks": "clicks" } as const;

/** Per-email rows ("email:<name>") summed over the window, with open and click-through rates on delivered. */
function emailTable(rows: { metric_key: string; dimension: string; value: number | string }[]) {
  const byEmail = new Map<string, { name: string; sent: number; delivered: number; opens: number; clicks: number }>();
  for (const r of rows) {
    const field = EMAIL_KEYS[r.metric_key as keyof typeof EMAIL_KEYS];
    if (!field) continue;
    const cur = byEmail.get(r.dimension) ?? { name: r.dimension.slice("email:".length), sent: 0, delivered: 0, opens: 0, clicks: 0 };
    cur[field] += Number(r.value);
    byEmail.set(r.dimension, cur);
  }
  return [...byEmail.values()].sort((a, b) => b.sent - a.sent);
}

const AEO_WINDOW = 14;
const AEO_DIMS = ["", "stream:academy", "stream:consulting", "stream:talent"] as const;

/** AEO visibility per product stream: the latest daily snapshot, the change on ~7 days earlier, and the raw mentions/answers. */
function aeoByStream(rows: { metric_key: string; dimension: string; date: string; value: number | string }[]) {
  const series = (dim: string, key: string) => rows.filter((r) => r.dimension === dim && r.metric_key === key).sort((a, b) => a.date.localeCompare(b.date));
  const latest = (dim: string, key: string) => {
    const s = series(dim, key);
    return s.length ? Number(s[s.length - 1].value) : null;
  };
  const delta7 = (dim: string, key: string) => {
    const s = series(dim, key);
    if (!s.length) return null;
    const target = subDays(parseISO(s[s.length - 1].date), 7).toISOString().slice(0, 10);
    const prior = [...s].reverse().find((o) => o.date <= target) ?? s[0];
    return Number(s[s.length - 1].value) - Number(prior.value);
  };
  return AEO_DIMS.map((dim) => ({
    label: dim === "" ? "Overall" : dim.slice("stream:".length),
    visibility: latest(dim, "aeo.visibility"),
    delta: delta7(dim, "aeo.visibility"),
    mentions: latest(dim, "aeo.mentions"),
    responses: latest(dim, "aeo.responses"),
  })).filter((r) => r.visibility !== null);
}

const asPct = (f: number) => `${Math.round(f * 100)}%`;

const pct = (n: number, d: number) => (d > 0 ? `${Math.round((n / d) * 1000) / 10}%` : "—");

export const dynamic = "force-dynamic";
export const maxDuration = 300; // "Pull now" and the year-long HubSpot backfill run on this route

export default async function MetricsPage() {
  const header = (
    <div>
      <h1 className="text-2xl font-black tracking-tight">Metrics & sources</h1>
      <p className="text-sm text-muted-foreground">The metric catalog the loop reasons over, and where each number comes from.</p>
    </div>
  );
  if (!isSupabaseConfigured()) return <div className="space-y-6">{header}<NotConfigured /></div>;

  const weekAgo = subDays(new Date(), CAMPAIGN_DAYS).toISOString().slice(0, 10);
  const emailFrom = subDays(new Date(), EMAIL_DAYS).toISOString().slice(0, 10);
  const aeoFrom = subDays(new Date(), AEO_WINDOW).toISOString().slice(0, 10);
  const [{ data: sources }, { data: metrics }, { data: docs }, { data: freshness }, { data: firstHubSpot }, { data: campaignRows }, { data: emailRows }, { data: aeoRowsData }, { data: sovRow }] = await Promise.all([
    db().from("sources").select("*").order("id"),
    db().from("metrics").select("*").order("sort_order"),
    db().from("strategy_docs").select("*").order("sort_order"),
    db().from("metric_freshness").select("metric_key, latest_date"),
    db().from("metric_observations").select("date").eq("metric_key", "hubspot.new_contacts").eq("dimension", "").order("date").limit(1),
    db()
      .from("metric_observations")
      .select("metric_key, dimension, value")
      .in("metric_key", ["ga4.campaign_sessions", "ga4.campaign_key_events"])
      .like("dimension", "%campaign:%")
      .gte("date", weekAgo)
      .limit(5000),
    db()
      .from("metric_observations")
      .select("metric_key, dimension, value")
      .in("metric_key", Object.keys(EMAIL_KEYS))
      .like("dimension", "email:%")
      .gte("date", emailFrom)
      .limit(5000),
    db()
      .from("metric_observations")
      .select("metric_key, dimension, date, value")
      .in("metric_key", ["aeo.visibility", "aeo.mentions", "aeo.responses"])
      .in("dimension", ["", "stream:academy", "stream:consulting", "stream:talent"])
      .gte("date", aeoFrom)
      .limit(5000),
    db().from("metric_observations").select("date, value").eq("metric_key", "aeo.share_of_voice").eq("dimension", "").order("date", { ascending: false }).limit(1),
  ]);
  const campaigns = topCampaigns(campaignRows ?? []);
  const emails = emailTable(emailRows ?? []);
  const aeo = aeoByStream(aeoRowsData ?? []);
  const overallSov = sovRow?.[0] ? Number(sovRow[0].value) : null;
  const latest = new Map((freshness ?? []).map((f) => [f.metric_key as string, f.latest_date as string]));
  const today = new Date().toISOString().slice(0, 10);
  // Offer the one-off HubSpot backfill until about a year of history is stored.
  const hubspotFrom = (firstHubSpot?.[0]?.date as string | undefined) ?? null;
  const offerBackfill = !hubspotFrom || Date.parse(hubspotFrom) > Date.parse(today) - 330 * 86_400_000;
  const formulas = new Map(((metrics ?? []) as Metric[]).map((m) => [m.key, m.formula]));

  return (
    <div className="space-y-8">
      {header}
      <section className="space-y-2">
        <h2 className="text-lg font-bold">Sources</h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {/* A source with no active metrics is retired (SEO, replaced by Search Console), so no card. */}
          {((sources ?? []) as Source[]).filter((s) => ((metrics ?? []) as Metric[]).some((m) => m.source_id === s.id && m.active)).map((s) => (
            <div key={s.id} className="rounded-lg border p-3 text-sm">
              <div className="flex items-center justify-between">
                <p className="font-medium">{s.name}</p>
                <Badge variant={s.last_synced_at ? "secondary" : "outline"}>{s.last_synced_at ? "receiving" : "not connected yet"}</Badge>
              </div>
              <p className="mt-1 text-muted-foreground">
                {s.ingest_method.replace("_", " ")} ·{" "}
                {s.last_synced_at ? `last data ${formatDistanceToNow(parseISO(s.last_synced_at), { addSuffix: true })}` : "no data yet"}
              </p>
              {s.last_error && <p className="mt-1 rounded bg-bad/15 px-2 py-1 text-primary">{s.last_error}</p>}
              {(s.id === "hubspot" || s.id === "ticket_tailor" || s.id === "learnworlds" || s.id === "meta_ads") && (
                <div className="mt-2 flex flex-wrap gap-2">
                  <PullSourceButton source={s.id} label={s.name} />
                  {s.id === "hubspot" && offerBackfill && <BackfillHubSpotButton />}
                </div>
              )}
            </div>
          ))}
        </div>
      </section>

      <section className="space-y-2">
        <div>
          <h2 className="text-lg font-bold">Campaigns and buttons</h2>
          <p className="text-sm text-muted-foreground">
            Visits from UTM-tagged links in the last {CAMPAIGN_DAYS} days, by campaign and button (utm_content), on the site they landed on.
          </p>
        </div>
        {campaigns.length === 0 ? (
          <p className="rounded-lg border p-3 text-sm text-muted-foreground">No tagged visits yet. They appear after the GA4 Zap&apos;s next daily run.</p>
        ) : (
          <div className="overflow-x-auto rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Site</TableHead>
                  <TableHead>Campaign</TableHead>
                  <TableHead>Button</TableHead>
                  <TableHead className="text-right">Sessions</TableHead>
                  <TableHead className="text-right">Key events</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {campaigns.map((c) => (
                  <TableRow key={`${c.site}|${c.campaign}|${c.button}`}>
                    <TableCell>{c.site}</TableCell>
                    <TableCell className="font-medium">{c.campaign}</TableCell>
                    <TableCell>{c.button}</TableCell>
                    <TableCell className="text-right">{c.sessions}</TableCell>
                    <TableCell className="text-right">{c.keyEvents}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </section>

      <section className="space-y-2">
        <div>
          <h2 className="text-lg font-bold">AI answer visibility (AEO)</h2>
          <p className="text-sm text-muted-foreground">
            How often AI assistants name ScrumCraft in their answers, by product stream, from the daily snapshot of the Brand knowledge prompts. The latest value and the change on a week earlier. A leading indicator (SCM-298).
          </p>
        </div>
        {aeo.length === 0 ? (
          <p className="rounded-lg border p-3 text-sm text-muted-foreground">No AEO snapshots yet.</p>
        ) : (
          <>
            <div className="overflow-x-auto rounded-lg border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Stream</TableHead>
                    <TableHead className="text-right">AI visibility</TableHead>
                    <TableHead className="text-right">7-day change</TableHead>
                    <TableHead className="text-right">Answers mentioning us</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {aeo.map((r) => (
                    <TableRow key={r.label}>
                      <TableCell className="font-medium capitalize">{r.label}</TableCell>
                      <TableCell className="text-right">{asPct(r.visibility!)}</TableCell>
                      <TableCell className="text-right">{r.delta === null ? "—" : `${r.delta >= 0 ? "+" : ""}${Math.round(r.delta * 100)} pts`}</TableCell>
                      <TableCell className="text-right">{r.mentions ?? 0} of {r.responses ?? 0}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            {overallSov !== null && (
              <p className="text-xs text-muted-foreground">Overall share of voice {asPct(overallSov)} — our mentions as a share of all brands named across the answers checked.</p>
            )}
          </>
        )}
      </section>

      <section className="space-y-2">
        <div>
          <h2 className="text-lg font-bold">Marketing emails</h2>
          <p className="text-sm text-muted-foreground">
            HubSpot marketing emails with sends in the last {EMAIL_DAYS} days. Open and click-through rates are on delivered emails.
          </p>
        </div>
        {emails.length === 0 ? (
          <p className="rounded-lg border p-3 text-sm text-muted-foreground">No marketing emails sent in the last {EMAIL_DAYS} days.</p>
        ) : (
          <div className="overflow-x-auto rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Email</TableHead>
                  <TableHead className="text-right">Sent</TableHead>
                  <TableHead className="text-right">Delivered</TableHead>
                  <TableHead className="text-right">Opens</TableHead>
                  <TableHead className="text-right">Clicks</TableHead>
                  <TableHead className="text-right">Open rate</TableHead>
                  <TableHead className="text-right">Click-through rate</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {emails.map((e) => (
                  <TableRow key={e.name}>
                    <TableCell className="font-medium">{e.name}</TableCell>
                    <TableCell className="text-right">{e.sent}</TableCell>
                    <TableCell className="text-right">{e.delivered}</TableCell>
                    <TableCell className="text-right">{e.opens}</TableCell>
                    <TableCell className="text-right">{e.clicks}</TableCell>
                    <TableCell className="text-right">{pct(e.opens, e.delivered)}</TableCell>
                    <TableCell className="text-right">{pct(e.clicks, e.delivered)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </section>

      <section className="space-y-2">
        <div className="flex items-end justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold">Strategy docs</h2>
            <p className="text-sm text-muted-foreground">Confluence pages the loop reads so its advice follows our strategy and brand voice.</p>
          </div>
          <RefreshDocsButton />
        </div>
        <ul className="divide-y rounded-lg border text-sm">
          {((docs ?? []) as StrategyDoc[]).map((d) => (
            <li key={d.page_id} className="flex flex-wrap items-center justify-between gap-2 p-3">
              <a href={d.url} target="_blank" rel="noreferrer" className="font-medium hover:underline">{d.title}</a>
              <span className="text-muted-foreground">
                {d.fetched_at
                  ? `v${d.version} · ${Math.round((d.content?.length ?? 0) / 1000)}k chars · fetched ${formatDistanceToNow(parseISO(d.fetched_at), { addSuffix: true })}`
                  : "not fetched yet"}
              </span>
            </li>
          ))}
        </ul>
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-bold">Metric catalog</h2>
        <div className="overflow-x-auto rounded-lg border">
          {/* Fixed column widths and wrapping text, so all columns fit without scrolling sideways on a laptop or larger. */}
          <Table className="min-w-[720px] table-fixed">
            <TableHeader>
              <TableRow>
                <TableHead className="w-[28%] whitespace-normal">Metric</TableHead>
                <TableHead className="w-[10%] whitespace-normal">Data</TableHead>
                <TableHead className="w-[17%] whitespace-normal">Key</TableHead>
                <TableHead className="w-[9%] whitespace-normal">Type</TableHead>
                <TableHead className="w-[10%] whitespace-normal">Stage</TableHead>
                <TableHead className="w-[18%] whitespace-normal">Source / formula</TableHead>
                <TableHead className="w-[8%] whitespace-normal">Better when</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {((metrics ?? []) as Metric[]).map((m) => (
                <TableRow key={m.key}>
                  <TableCell className="whitespace-normal">
                    <p className="font-medium">{m.name}{m.is_north_star && " ★"}</p>
                    {m.description && <p className="text-xs text-muted-foreground">{m.description}</p>}
                  </TableCell>
                  <TableCell>
                    <OnlineLozenge online={isOnline(m, latest, today, formulas)} latest={latest.get(m.key)} />
                  </TableCell>
                  <TableCell className="whitespace-normal text-xs [overflow-wrap:anywhere]">{m.key}</TableCell>
                  <TableCell><Badge variant={m.indicator === "leading" ? "secondary" : "outline"}>{m.indicator}</Badge></TableCell>
                  <TableCell className="capitalize">{m.funnel_stage}</TableCell>
                  <TableCell className="whitespace-normal text-xs text-muted-foreground [overflow-wrap:anywhere]">{m.formula ?? m.source_id}</TableCell>
                  <TableCell>{m.direction === "up_good" ? "higher" : "lower"}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </section>
    </div>
  );
}
