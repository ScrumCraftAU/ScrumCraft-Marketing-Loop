import type { Unit } from "@/lib/types";

const compact = new Intl.NumberFormat("en-AU", { notation: "compact", maximumFractionDigits: 1 });
const aud = new Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD", maximumFractionDigits: 0 });
const audCents = new Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD", maximumFractionDigits: 2 });

export function formatValue(value: number | null, unit: Unit): string {
  if (value === null || Number.isNaN(value)) return "—";
  switch (unit) {
    case "aud":
      return Math.abs(value) < 100 ? audCents.format(value) : aud.format(value);
    case "percent":
      return `${(value * 100).toFixed(1)}%`;
    case "ratio":
      return `${value.toFixed(2)}×`;
    case "position":
      return value.toFixed(1);
    default:
      return Math.abs(value) >= 10_000 ? compact.format(value) : Math.round(value).toLocaleString("en-AU");
  }
}

export function formatChange(change: number | null): string {
  if (change === null) return "—";
  const sign = change > 0 ? "+" : change < 0 ? "−" : "";
  return `${sign}${Math.abs(change * 100).toFixed(0)}%`;
}
