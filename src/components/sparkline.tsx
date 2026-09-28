import { formatValue } from "@/lib/format";
import type { Unit } from "@/lib/types";

/** Single-series daily sparkline. Server-rendered SVG, with gaps where there's no data. */
export function Sparkline({
  series,
  unit,
  label,
}: {
  series: { date: string; value: number | null }[];
  unit: Unit;
  label: string;
}) {
  const W = 120;
  const H = 32;
  const vals = series.map((p) => p.value).filter((v): v is number => v !== null);
  if (vals.length < 2) {
    return <div className="h-8 w-[120px] rounded bg-muted/50" aria-label={`${label}: not enough data`} />;
  }
  const min = Math.min(...vals);
  const max = Math.max(...vals);
  const span = max - min || 1;
  const x = (i: number) => (i / (series.length - 1)) * (W - 6) + 3;
  const y = (v: number) => H - 4 - ((v - min) / span) * (H - 8);

  let d = "";
  let pen = false;
  series.forEach((p, i) => {
    if (p.value === null) {
      pen = false;
      return;
    }
    d += `${pen ? "L" : "M"}${x(i).toFixed(1)},${y(p.value).toFixed(1)}`;
    pen = true;
  });
  const lastIdx = series.findLastIndex((p) => p.value !== null);
  const last = series[lastIdx];
  const summary = `${label}: ${formatValue(last.value, unit)} on ${last.date} (35-day range ${formatValue(min, unit)}–${formatValue(max, unit)})`;

  return (
    <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} className="shrink-0 text-foreground/60" role="img" aria-label={summary}>
      <title>{summary}</title>
      <path d={d} fill="none" stroke="currentColor" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={x(lastIdx)} cy={y(last.value!)} r={3} className="fill-foreground stroke-card" strokeWidth={2} />
    </svg>
  );
}
