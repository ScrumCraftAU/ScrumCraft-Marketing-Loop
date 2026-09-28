import Link from "next/link";
import { formatDistanceToNow, parseISO, format } from "date-fns";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { MetricTile } from "@/components/metric-tile";
import { NotConfigured } from "@/components/not-configured";
import { RunLoopButton } from "@/components/run-loop-button";
import { isSupabaseConfigured } from "@/lib/env";
import { computeStats } from "@/lib/metrics/stats";
import { db } from "@/lib/supabase/server";
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

  const [stats, { data: runs }] = await Promise.all([
    computeStats(),
    db().from("loop_runs").select("*").order("started_at", { ascending: false }).limit(1),
  ]);
  const lastRun = (runs?.[0] ?? null) as LoopRun | null;
  const { data: findings } = lastRun
    ? await db().from("loop_findings").select("*").eq("loop_run_id", lastRun.id).neq("severity", "info").limit(5)
    : { data: [] };

  const northStar = stats.metrics.filter((s) => s.metric.is_north_star);

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
          <CardContent className="space-y-3 text-sm">
            {lastRun ? (
              <>
                <p className="text-muted-foreground">
                  <Badge variant={lastRun.status === "failed" ? "destructive" : "secondary"}>{lastRun.status}</Badge>{" "}
                  {lastRun.trigger} · {formatDistanceToNow(parseISO(lastRun.started_at), { addSuffix: true })}
                </p>
                <p className="whitespace-pre-line">{lastRun.summary ?? lastRun.error ?? "—"}</p>
                {(findings as LoopFinding[] | null)?.length ? (
                  <ul className="space-y-1">
                    {(findings as LoopFinding[]).map((f) => (
                      <li key={f.id}>
                        <Badge variant={f.severity === "alert" ? "destructive" : "outline"}>{f.severity}</Badge>{" "}
                        {f.title}
                      </li>
                    ))}
                  </ul>
                ) : null}
              </>
            ) : (
              <p className="text-muted-foreground">No runs yet. Hit “Run loop now” to do the first Check → Act → Plan.</p>
            )}
          </CardContent>
        </Card>
      </div>

      {(["leading", "lagging"] as const).map((indicator) => (
        <section key={indicator} className="space-y-4">
          <div>
            <h2 className="text-lg font-semibold capitalize">{indicator} indicators</h2>
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
        <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
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
