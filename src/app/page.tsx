import Link from "next/link";
import { formatDistanceToNow, parseISO, format } from "date-fns";
import { cn } from "cn";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { MetricTile } from "@/components/metric-tile";
import { NotConfigured } from "@/components/not-configured";
import { RunLoopButton } from "@/components/run-loop-button";
import { isSupabaseConfigured } from "@/lib/env";
import { computeStats } from "@/lib/metrics/stats";
import { computeSiteStats } from "@/lib/metrics/sites";
import { SiteTable } from "@/components/site-table";
import { db } from "@/lib/supabase/server";
import { runStatusLabel } from "@/lib/format";
import type { FunnelStage, LoopFinding, LoopRun } from "@/lib/types";

export const dynamic = "force-dynamic";
export const maxDuration = 300; // the "Run loop now" server action runs on this route

const STAGES: { id: FunnelStage; label: string }[] = [
  { id: "awareness", label: "Awareness" },
  { id: "engagement", label: "Engagement" },
  { id: "conversion", label: "Conversion" },
  { id: "revenue", label: "Revenue & efficiency" },
];

export default async function DashboardPage() {
  if (!isSupabaseConfigured()) {
    return (
      <div className="space-y-6">
        <PageHeader />
        <NotConfigured />
      </div>
    );
  }

  const [stats, sites, { data: runs }] = await Promise.all([
    computeStats(),
    computeSiteStats(),
    db().from("loop_runs").select("*").order("started_at", { ascending: false }).limit(1),
  ]);
  const lastRun = (runs?.[0] ?? null) as LoopRun | null;
  const { data: findings } = lastRun
    ? await db().from("loop_findings").select("*").eq("loop_run_id", lastRun.id).limit(50)
    : { data: [] };

  const northStar = stats.metrics.filter((s) => s.metric.is_north_star);

  // Lead with the key points: alerts, then watches, then wins — a few of each so the card stays scannable.
  const SEVERITY_RANK: Record<string, number> = { alert: 0, watch: 1, info: 2 };
  const SEVERITY_CAP: Record<string, number> = { alert: 3, watch: 3, info: 2 };
  const shownFindings = (() => {
    const seen: Record<string, number> = {};
    return [...((findings as LoopFinding[] | null) ?? [])]
      .sort((a, b) => (SEVERITY_RANK[a.severity] ?? 9) - (SEVERITY_RANK[b.severity] ?? 9))
      .filter((f) => (seen[f.severity] = (seen[f.severity] ?? 0) + 1) <= (SEVERITY_CAP[f.severity] ?? 0));
  })();

  return (
    <div className="space-y-8">
      <PageHeader asOf={stats.asOf} periodStart={stats.periodStart} />

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="grid gap-4">
          {northStar.map((s) => (
            <MetricTile key={s.metric.key} stats={s} emphasis />
          ))}
        </div>
        <Card className="lg:col-span-2">
          <CardHeader className="flex flex-row items-center justify-between gap-2">
            <CardTitle>Latest loop run</CardTitle>
            {lastRun && (
              <Link href={`/loop/${lastRun.id}`} className="text-sm text-muted-foreground hover:text-foreground">
                View run →
              </Link>
            )}
          </CardHeader>
          <CardContent className="space-y-4 text-sm">
            {lastRun ? (
              <>
                <div className="flex flex-wrap items-center gap-2 text-muted-foreground">
                  <Badge variant={lastRun.status === "failed" ? "destructive" : "secondary"}>{runStatusLabel(lastRun.status)}</Badge>
                  <span>
                    {lastRun.trigger} · {formatDistanceToNow(parseISO(lastRun.started_at), { addSuffix: true })}
                  </span>
                </div>
                {shownFindings.length ? (
                  <ul className="space-y-2.5">
                    {shownFindings.map((f) => (
                      <li key={f.id} className="flex items-start gap-2.5">
                        <span
                          aria-hidden
                          className={cn(
                            "mt-[0.3rem] size-2 shrink-0 rounded-full",
                            f.severity === "alert" ? "bg-destructive" : f.severity === "watch" ? "bg-warning" : "bg-good",
                          )}
                        />
                        <div className="space-y-0.5">
                          <span className="text-[0.65rem] font-semibold tracking-wider text-muted-foreground uppercase">
                            {f.kind === "win" ? "win" : f.severity}
                          </span>
                          <p className="leading-snug font-medium text-foreground">{f.title}</p>
                        </div>
                      </li>
                    ))}
                  </ul>
                ) : null}
                {lastRun.summary ? (
                  <p className="max-w-prose border-t pt-3 leading-relaxed whitespace-pre-line text-muted-foreground">
                    {lastRun.summary}
                  </p>
                ) : lastRun.error ? (
                  <p className="leading-relaxed text-muted-foreground">{lastRun.error}</p>
                ) : null}
              </>
            ) : (
              <p className="text-muted-foreground">No runs yet. Hit “Run loop now” to do the first Check → Act → Plan.</p>
            )}
          </CardContent>
        </Card>
      </div>

      {sites.length > 0 && (
        <section className="space-y-2">
          <div>
            <h2 className="text-lg font-bold">Web properties</h2>
            <p className="text-sm text-muted-foreground">This week per GA4 property, with change vs the 4-week average.</p>
          </div>
          <SiteTable sites={sites} />
        </section>
      )}

      {(["leading", "lagging"] as const).map((indicator) => (
        <section key={indicator} className="space-y-4">
          <div>
            <h2 className="text-lg font-bold capitalize">{indicator} indicators</h2>
            <p className="text-sm text-muted-foreground">
              {indicator === "leading"
                ? "Early signals we can move this week — traffic, engagement, lead capture."
                : "Outcomes that follow — bookings, deals, revenue and cost efficiency."}
            </p>
          </div>
          {STAGES.map((stage) => {
            const tiles = stats.metrics.filter(
              (s) => s.metric.indicator === indicator && s.metric.funnel_stage === stage.id && !s.metric.is_north_star,
            );
            if (!tiles.length) return null;
            return (
              <div key={stage.id} className="space-y-2">
                <h3 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{stage.label}</h3>
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  {tiles.map((s) => (
                    <MetricTile key={s.metric.key} stats={s} />
                  ))}
                </div>
              </div>
            );
          })}
        </section>
      ))}
    </div>
  );
}

function PageHeader({ asOf, periodStart }: { asOf?: string; periodStart?: string }) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <h1 className="text-2xl font-black tracking-tight">Dashboard</h1>
        {asOf && periodStart && (
          <p className="text-sm text-muted-foreground">
            Week {format(parseISO(periodStart), "d MMM")} – {format(parseISO(asOf), "d MMM yyyy")}, compared with the
            4-week average
          </p>
        )}
      </div>
      <RunLoopButton />
    </div>
  );
}
