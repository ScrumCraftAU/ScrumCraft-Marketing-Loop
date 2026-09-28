import { formatDistanceToNow, parseISO } from "date-fns";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { NotConfigured } from "@/components/not-configured";
import { isSupabaseConfigured } from "@/lib/env";
import { db } from "@/lib/supabase/server";
import type { Metric, Source } from "@/lib/types";
import type { StrategyDoc } from "@/lib/strategy/confluence";
import { RefreshDocsButton } from "@/components/refresh-docs-button";

export const dynamic = "force-dynamic";

export default async function MetricsPage() {
  const header = (
    <div>
      <h1 className="text-2xl font-black tracking-tight">Metrics & sources</h1>
      <p className="text-sm text-muted-foreground">The metric catalog the loop reasons over, and where each number comes from.</p>
    </div>
  );
  if (!isSupabaseConfigured()) return <div className="space-y-6">{header}<NotConfigured /></div>;

  const [{ data: sources }, { data: metrics }, { data: docs }] = await Promise.all([
    db().from("sources").select("*").order("id"),
    db().from("metrics").select("*").order("sort_order"),
    db().from("strategy_docs").select("*").order("sort_order"),
  ]);

  return (
    <div className="space-y-8">
      {header}
      <section className="space-y-2">
        <h2 className="text-lg font-bold">Sources</h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {((sources ?? []) as Source[]).map((s) => (
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
            </div>
          ))}
        </div>
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
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Metric</TableHead>
                <TableHead>Key</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Stage</TableHead>
                <TableHead>Source / formula</TableHead>
                <TableHead>Better when</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {((metrics ?? []) as Metric[]).map((m) => (
                <TableRow key={m.key}>
                  <TableCell>
                    <p className="font-medium">{m.name}{m.is_north_star && " ★"}</p>
                    {m.description && <p className="text-xs text-muted-foreground">{m.description}</p>}
                  </TableCell>
                  <TableCell className="text-xs">{m.key}</TableCell>
                  <TableCell><Badge variant={m.indicator === "leading" ? "secondary" : "outline"}>{m.indicator}</Badge></TableCell>
                  <TableCell className="capitalize">{m.funnel_stage}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">{m.formula ?? m.source_id}</TableCell>
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
