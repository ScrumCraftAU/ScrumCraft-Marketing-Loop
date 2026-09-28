import { Badge } from "@/components/ui/badge";
import { NotConfigured } from "@/components/not-configured";
import { ExperimentActions } from "@/components/experiment-actions";
import { isSupabaseConfigured } from "@/lib/env";
import { db } from "@/lib/supabase/server";
import type { Experiment, ExperimentStatus } from "@/lib/types";

export const dynamic = "force-dynamic";

const COLUMNS: { label: string; hint: string; statuses: ExperimentStatus[] }[] = [
  { label: "Plan", hint: "Proposed by the loop — approve or reject", statuses: ["proposed", "approved"] },
  { label: "Do", hint: "Running in the real world", statuses: ["running"] },
  { label: "Check", hint: "Check date reached — review the result", statuses: ["checking"] },
  { label: "Act", hint: "Decided: adopted, adapted or abandoned", statuses: ["adopted", "adapted", "abandoned"] },
];

export default async function ExperimentsPage() {
  const header = (
    <div>
      <h1 className="text-2xl font-semibold tracking-tight">Experiments</h1>
      <p className="text-sm text-muted-foreground">The PDCA board. The loop proposes and reviews; the team decides.</p>
    </div>
  );
  if (!isSupabaseConfigured()) return <div className="space-y-6">{header}<NotConfigured /></div>;

  const { data } = await db().from("experiments").select("*").neq("status", "rejected").order("created_at", { ascending: false });
  const experiments = (data ?? []) as Experiment[];

  return (
    <div className="space-y-6">
      {header}
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {COLUMNS.map((col) => {
          const items = experiments.filter((e) => col.statuses.includes(e.status));
          return (
            <section key={col.label} className="space-y-3 rounded-xl bg-muted/40 p-3">
              <div>
                <h2 className="font-semibold">{col.label} <span className="text-muted-foreground">({items.length})</span></h2>
                <p className="text-xs text-muted-foreground">{col.hint}</p>
              </div>
              {items.map((e) => (
                <article key={e.id} className="space-y-2 rounded-lg border bg-card p-3 text-sm">
                  <div className="flex items-start justify-between gap-2">
                    <p className="font-medium">{e.title}</p>
                    <Badge variant="outline">{e.status}</Badge>
                  </div>
                  <p className="text-muted-foreground">{e.hypothesis}</p>
                  {e.action && <p><span className="font-medium">Do:</span> {e.action}</p>}
                  <p className="font-mono text-xs text-muted-foreground">
                    {e.target_metric_key ?? "no metric"}
                    {e.expected_change_pct !== null ? ` · target ${e.expected_change_pct > 0 ? "+" : ""}${e.expected_change_pct}%` : ""}
                    {e.check_date ? ` · check ${e.check_date}` : ""}
                  </p>
                  <ExperimentActions id={e.id} status={e.status} />
                </article>
              ))}
            </section>
          );
        })}
      </div>
    </div>
  );
}
