import { ArrowDownRight, ArrowUpRight, Minus } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Sparkline } from "@/components/sparkline";
import { formatChange, formatValue } from "@/lib/format";
import type { MetricStats } from "@/lib/metrics/stats";
import { cn } from "@/lib/utils";

/** Stat tile: this week's value, change vs 4-week average (good/bad by metric direction), sparkline. */
export function MetricTile({
  stats,
  emphasis = false,
  monthTarget,
}: {
  stats: MetricStats;
  emphasis?: boolean;
  monthTarget?: { value: number | null; target: number };
}) {
  const { metric, current, changeVsBaseline, signal, dataDays } = stats;
  const monthPct = monthTarget && monthTarget.value !== null && monthTarget.target ? monthTarget.value / monthTarget.target : null;
  const monthOnTrack = monthPct !== null && monthPct >= 0.9;
  const Arrow =
    changeVsBaseline === null || Math.abs(changeVsBaseline) < 0.005
      ? Minus
      : changeVsBaseline > 0
        ? ArrowUpRight
        : ArrowDownRight;
  const tone = signal === null || Math.abs(signal) < 0.05 ? "neutral" : signal > 0 ? "good" : "bad";

  return (
    <Card className={cn("gap-2 py-4", emphasis && "ring-2 ring-foreground/15")}>
      <CardContent className="flex flex-col gap-2 px-4">
        <div className="flex items-start justify-between gap-2">
          <p className="text-sm leading-tight text-muted-foreground">{metric.name}</p>
          {dataDays === 0 && (
            <span className="shrink-0 rounded bg-muted px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-muted-foreground">
              Waiting for data
            </span>
          )}
        </div>
        <div className="flex items-end justify-between gap-3">
          <div className="min-w-0">
            <p className={cn("font-bold tabular-nums", emphasis ? "text-3xl" : "text-2xl")}>
              {formatValue(current, metric.unit)}
            </p>
            {metric.target_value != null && !monthTarget && (
              <p className="mt-0.5 text-[11px] leading-tight text-muted-foreground tabular-nums">
                {metric.direction === "down_good" ? "limit" : "target"} {formatValue(metric.target_value, metric.unit)}
                {metric.target_period ? ` / ${metric.target_period}` : ""}
              </p>
            )}
            <p
              className={cn(
                "mt-1 inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-xs font-medium tabular-nums",
                tone === "good" && "bg-good/25 text-primary",
                tone === "bad" && "bg-bad/15 text-primary",
                tone === "neutral" && "bg-muted text-muted-foreground",
              )}
              title="This week vs the average of the previous 4 weeks"
            >
              <Arrow className="size-3" aria-hidden />
              {formatChange(changeVsBaseline)}
              <span className="sr-only">{tone === "good" ? "(improving)" : tone === "bad" ? "(needs attention)" : ""}</span>
            </p>
          </div>
          <Sparkline series={stats.series} unit={metric.unit} label={metric.name} />
        </div>
        {monthTarget && (
          <div className="flex flex-col gap-1">
            <div className="h-1.5 w-full overflow-hidden rounded bg-muted" aria-hidden>
              <div
                className={cn("h-full rounded", monthOnTrack ? "bg-good" : "bg-bad")}
                style={{ width: `${monthPct === null ? 0 : Math.min(100, Math.max(0, monthPct * 100))}%` }}
              />
            </div>
            <p className="text-xs tabular-nums text-muted-foreground">
              {formatValue(monthTarget.value, metric.unit)} of {formatValue(monthTarget.target, metric.unit)} this month
              {monthPct !== null ? ` · ${Math.round(monthPct * 100)}%` : ""}
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
