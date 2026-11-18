import { Card, CardContent } from "@/components/ui/card";
import { Sparkline } from "@/components/sparkline";
import { formatValue } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { DeliveredForecast } from "@/lib/metrics/delivered";

/**
 * Mission card: projected revenue *delivered* this month (deal value spread over its delivery months)
 * against the $100k goal, with the forward trajectory. The relative counterpart to the lumpy,
 * booked-at-close "Closed-won revenue" tile.
 */
export function DeliveredRevenueCard({ forecast }: { forecast: DeliveredForecast }) {
  const { current, target, months } = forecast;
  const pct = current !== null && target ? current / target : null;
  const onTrack = pct !== null && pct >= 0.9;
  const barPct = pct === null ? 0 : Math.min(100, Math.max(0, pct * 100));
  const series = months.map((m) => ({ date: `${m.month}-01`, value: m.value }));

  return (
    <Card className="gap-2 py-4 ring-2 ring-foreground/15">
      <CardContent className="flex flex-col gap-2 px-4">
        <div className="flex items-start justify-between gap-2">
          <p className="text-sm leading-tight text-muted-foreground">Revenue delivery vs $100k / month</p>
          {current === null && (
            <span className="shrink-0 rounded bg-muted px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-muted-foreground">
              Waiting for data
            </span>
          )}
        </div>
        <div className="flex items-end justify-between gap-3">
          <div className="min-w-0">
            <p className="text-3xl font-bold tabular-nums">{formatValue(current, "aud")}</p>
            {target && (
              <p className="mt-1 text-xs text-muted-foreground tabular-nums">
                of {formatValue(target, "aud")} this month{pct !== null ? ` · ${Math.round(pct * 100)}%` : ""}
              </p>
            )}
          </div>
          <Sparkline series={series} unit="aud" label="Delivered revenue by month" />
        </div>
        <div className="h-1.5 w-full overflow-hidden rounded bg-muted" aria-hidden>
          <div className={cn("h-full rounded", onTrack ? "bg-good" : "bg-bad")} style={{ width: `${barPct}%` }} />
        </div>
        <p className="text-[11px] leading-tight text-muted-foreground">
          Won + weighted pipeline, spread over the months each deal is delivered.
        </p>
      </CardContent>
    </Card>
  );
}
