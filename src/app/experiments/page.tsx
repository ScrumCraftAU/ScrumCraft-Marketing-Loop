import { Badge } from "@/components/ui/badge";
import { NotConfigured } from "@/components/not-configured";
import { ExperimentActions } from "@/components/experiment-actions";
import { isSupabaseConfigured } from "@/lib/env";
import { db } from "@/lib/supabase/server";
import { jiraIssueUrl } from "@/lib/jira/client";
import { syncExperimentsFromJira } from "@/lib/jira/sync";
import { WIP_LIMIT } from "@/lib/jira/status";
import type { Experiment, ExperimentStatus } from "@/lib/types";

export const dynamic = "force-dynamic";

const COLUMNS: { label: string; hint: string; statuses: ExperimentStatus[]; wip: boolean }[] = [
  { label: "Plan", hint: "Proposed by the loop — approve or reject", statuses: ["proposed", "approved"], wip: true },
  { label: "Do", hint: "Running in the real world", statuses: ["running"], wip: true },
  { label: "Check", hint: "Check date reached — review the result", statuses: ["checking"], wip: true },
  { label: "Act", hint: "Done, or decided: adopted, adapted or abandoned", statuses: ["done", "adopted", "adapted", "abandoned"], wip: false },
];

export default async function ExperimentsPage() {
  const header = (
    <div>
      <h1 className="text-2xl font-black tracking-tight">Experiments</h1>
      <p className="text-sm text-muted-foreground">
        The PDCA board. The loop proposes and reviews; the team decides. Linked Jira items move with their
        experiment, in either direction. Plan, Do and Check each hold up to {WIP_LIMIT}.
      </p>
    </div>
  );
  if (!isSupabaseConfigured()) return <div className="space-y-6">{header}<NotConfigured /></div>;

  // Pick up any moves made in Jira since the board was last opened.
  const sync = await syncExperimentsFromJira();
  const { data } = await db().from("experiments").select("*").neq("status", "rejected").order("created_at", { ascending: false });
  const experiments = (data ?? []) as Experiment[];

  return (
    <div className="space-y-6">
      {header}
      {sync.error && (
        <p className="rounded-lg bg-cta/20 px-3 py-2 text-sm">
          Jira couldn&apos;t be reached just now, so linked items show their last known status. ({sync.error})
        </p>
      )}
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {COLUMNS.map((col) => {
          const items = experiments.filter((e) => col.statuses.includes(e.status));
          return (
            <section key={col.label} className="space-y-3 rounded-xl bg-muted/40 p-3">
              <div>
                <h2 className="font-bold">
                  {col.label}{" "}
                  <span className="text-muted-foreground">
                    ({items.length}{col.wip ? `/${WIP_LIMIT}` : ""})
                  </span>
                  {col.wip && items.length > WIP_LIMIT && (
                    <span className="ml-2 rounded bg-cta/30 px-1.5 py-0.5 text-xs font-medium">over the limit — finish one first</span>
                  )}
                </h2>
                <p className="text-xs text-muted-foreground">{col.hint}</p>
              </div>
              {items.map((e) => (
                <article key={e.id} className="space-y-2 rounded-lg border bg-card p-3 text-sm">
                  <div className="flex items-start justify-between gap-2">
                    <p className="font-medium">{e.title}</p>
                    <Badge variant="outline">{e.status}</Badge>
                  </div>
                  {e.jira_key && (
                    <p className="text-xs">
                      <a href={jiraIssueUrl(e.jira_key)} target="_blank" rel="noreferrer" className="font-medium underline underline-offset-2">
                        {e.jira_key}
                      </a>
                      {e.jira_status && <span className="text-muted-foreground"> · Jira: {e.jira_status}</span>}
                    </p>
                  )}
                  <p className="text-muted-foreground">{e.hypothesis}</p>
                  {e.action && <p><span className="font-medium">Do:</span> {e.action}</p>}
                  {e.result_notes && (
                    <p className="rounded bg-good/15 px-2 py-1">
                      <span className="font-medium">Outcome:</span> {e.result_notes}
                    </p>
                  )}
                  <p className="text-xs text-muted-foreground">
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
