/**
 * Adelaide calendar days for pulled sources, matching the main-site GA4 property (552676870).
 * Dependency-free so it can be unit-tested with plain `node --test`.
 */
export const TIME_ZONE = "Australia/Adelaide";

const dayFormat = new Intl.DateTimeFormat("en-CA", { timeZone: TIME_ZONE, year: "numeric", month: "2-digit", day: "2-digit" });

/** yyyy-mm-dd of an instant, in Adelaide time. Accepts ISO strings or epoch ms (as number or string). */
export function adelaideDay(instant: string | number | Date): string | null {
  const d = instant instanceof Date ? instant : new Date(typeof instant === "string" && /^\d+$/.test(instant) ? Number(instant) : instant);
  return Number.isNaN(d.getTime()) ? null : dayFormat.format(d);
}

/** Epoch ms of 00:00 Adelaide time on `day` (yyyy-mm-dd), daylight saving included. */
export function adelaideMidnight(day: string): number {
  const [y, m, d] = day.split("-").map(Number);
  const guess = Date.UTC(y, m - 1, d);
  const offsetAt = (ms: number) => {
    const name = new Intl.DateTimeFormat("en-US", { timeZone: TIME_ZONE, timeZoneName: "longOffset" })
      .formatToParts(new Date(ms))
      .find((p) => p.type === "timeZoneName")?.value ?? "GMT";
    const match = /GMT([+-])(\d{2}):?(\d{2})?/.exec(name);
    return match ? (match[1] === "-" ? -1 : 1) * (Number(match[2]) * 60 + Number(match[3] ?? 0)) : 0;
  };
  // Re-check the offset at the computed instant in case the guess straddles a DST change.
  const first = guess - offsetAt(guess) * 60_000;
  return guess - offsetAt(first) * 60_000;
}

/** The last `count` Adelaide days ending yesterday, oldest first. */
export function lastDays(count: number, now = new Date()): string[] {
  const today = adelaideDay(now)!;
  const days: string[] = [];
  let ms = adelaideMidnight(today);
  for (let i = 0; i < count; i++) {
    ms -= 12 * 3_600_000; // step back into the previous day, then snap to its midnight
    const day = adelaideDay(ms)!;
    ms = adelaideMidnight(day);
    days.unshift(day);
  }
  return days;
}
