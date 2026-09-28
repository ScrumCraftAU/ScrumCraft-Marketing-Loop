import Link from "next/link";
import { notFound } from "next/navigation";
import { format, parseISO } from "date-fns";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { NotConfigured } from "@/components/not-configured";
import { isSupabaseConfigured } from "@/lib/env";
import { db } from "@/lib/supabase/server";
import type { Experiment, LoopFinding, LoopRun } from "@/lib/types";

export const dynamic = "force-dynamic";

const PHASES = [
  { id: "check", label: "Check — what changed" },
  { id: "act", label: "Act — recommendations" },
] as const;

export default async function LoopRunPage({ params }: PageProps<"/loop/[id]">) {
  if (!isSupabaseConfigured()) return <NotConfigured />;
  const { id } = await params;

  const { data: run } = await db().from("loop_runs").select("*").eq("id", id).maybeSingle();
  if (!run) notFound();
  const [{ data: findings }, { data: planned }] = await Promise.all([
    db().from("loop_findings").select("*").eq("loop_run_id", id).order("created_at"),
    db().from("experiments").select("*").eq("created_by_run_id", id),
  ]);
  const r = run as LoopRun;

  return (
    <div className="space-y-6">
      <div>
        <Link href="/loop" className="text-sm text-muted-foreground hover:text-foreground">← All runs</Link>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight">
          Loop run · {format(parseISO(r.started_at), "d MMM yyyy, h:mm a")}
        </h1>
        <p className="text-sm text-muted-foreground">
          <Badge variant={r.status === "failed" ? "destructive" : "secondary"}>{r.status}</Badge> {r.trigger}
          {r.model ? ` · ${r.model}` : ""} · data week {r.period_start} → {r.period_end}
        </p>
      </div>

      <Card>
        <CardHeader><CardTitle>Summary</CardTitle></CardHeader>
        <CardContent className="whitespace-pre-line text-sm">{r.summary ?? r.error ?? "—"}</CardContent>
      </Card>

      {PHASES.map((phase) => {
        const items = ((findings ?? []) as LoopFinding[]).filter((f) => f.phase === phase.id);
        return (
          <section key={phase.id} className="space-y-2">
            <h2 className="text-lg font-semibold">{phase.label}</h2>
            {items.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nothing notable.</p>
            ) : (
              <ul className="space-y-2">
                {items.map((f) => (
                  <li key={f.id} className="rounded-lg border p-3 text-sm">
                    <p className="font-medium">
                      <Badge variant={f.severity === "alert" ? "destructive" : "outline"}>{f.severity}</Badge>{" "}
                      <span className="text-muted-foreground">{f.kind.replace("_", " ")}</span> · {f.title}
                    </p>
                    <p className="mt-1 text-muted-foreground">{f.detail}</p>
                    {f.metric_key && <p className="mt-1 font-mono text-xs text-muted-foreground">{f.metric_key}</p>}
                  </li>
                ))}
              </ul>
            )}
          </section>
        );
      })}

      <section className="space-y-2">
        <h2 className="text-lg font-semibold">Plan — proposed experiments</h2>
        {!planned?.length ? (
          <p className="text-sm text-muted-foreground">No new experiments proposed.</p>
        ) : (
          <ul className="space-y-2">
            {(planned as Experiment[]).map((e) => (
              <li key={e.id} className="rounded-lg border p-3 text-sm">
                <p className="font-medium">{e.title} <Badge variant="outline">{e.status}</Badge></p>
                <p className="mt-1 text-muted-foreground">{e.hypothesis}</p>
              </li>
            ))}
          </ul>
        )}
        <Link href="/experiments" className="text-sm text-muted-foreground hover:text-foreground">Manage experiments →</Link>
      </section>
    </div>
  );
}
