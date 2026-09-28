import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatChange, formatValue } from "@/lib/format";
import type { SiteStats } from "@/lib/metrics/sites";
import { cn } from "@/lib/utils";

const COLUMNS = [
  { key: "ga4.sessions", label: "Sessions" },
  { key: "ga4.organic_sessions", label: "Organic" },
  { key: "ga4.course_page_views", label: "Course views" },
  { key: "ga4.form_submits", label: "Form submits" },
] as const;

/** This week per GA4 property, with change vs the 4-week average. */
export function SiteTable({ sites }: { sites: SiteStats[] }) {
  return (
    <div className="overflow-x-auto rounded-lg border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Property</TableHead>
            <TableHead>Brand</TableHead>
            {COLUMNS.map((c) => (
              <TableHead key={c.key} className="text-right">{c.label}</TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {sites.map((s) => (
            <TableRow key={s.propertyId}>
              <TableCell className="font-medium">{s.name}</TableCell>
              <TableCell className="text-muted-foreground">{s.brand}</TableCell>
              {COLUMNS.map((c) => {
                const m = s.metrics[c.key];
                const change = m.current !== null && m.baseline ? (m.current - m.baseline) / m.baseline : null;
                return (
                  <TableCell key={c.key} className="text-right tabular-nums">
                    {formatValue(m.current, "count")}
                    {change !== null && Math.abs(change) >= 0.005 && (
                      <span
                        className={cn(
                          "ml-2 text-xs",
                          change > 0 ? "text-emerald-700 dark:text-emerald-400" : "text-red-700 dark:text-red-400",
                        )}
                      >
                        {change > 0 ? "▲" : "▼"} {formatChange(change)}
                      </span>
                    )}
                  </TableCell>
                );
              })}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
