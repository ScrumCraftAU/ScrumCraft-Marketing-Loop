import Link from "next/link";
import { format, parseISO } from "date-fns";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { NotConfigured } from "@/components/not-configured";
import { RunLoopButton } from "@/components/run-loop-button";
import { isSupabaseConfigured } from "@/lib/env";
import { db } from "@/lib/supabase/server";
import type { LoopRun } from "@/lib/types";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export default async function LoopRunsPage() {
  const header = (
    <div className="flex items-end justify-between gap-3">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Loop runs</h1>
        <p className="text-sm text-muted-foreground">Each run checks the numbers, reviews experiments and plans the next ones.</p>
      </div>
      <RunLoopButton />
    </div>
  );
  if (!isSupabaseConfigured()) return <div className="space-y-6">{header}<NotConfigured /></div>;

  const { data } = await db().from("loop_runs").select("*").order("started_at", { ascending: false }).limit(60);
  const runs = (data ?? []) as LoopRun[];

  return (
    <div className="space-y-6">
      {header}
      <div className="overflow-x-auto rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Started</TableHead>
              <TableHead>Trigger</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Summary</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {runs.length === 0 && (
              <TableRow>
                <TableCell colSpan={4} className="text-muted-foreground">No runs yet.</TableCell>
              </TableRow>
            )}
            {runs.map((r) => (
              <TableRow key={r.id}>
                <TableCell className="whitespace-nowrap">
                  <Link href={`/loop/${r.id}`} className="hover:underline">
                    {format(parseISO(r.started_at), "d MMM yyyy, h:mm a")}
                  </Link>
                </TableCell>
                <TableCell>{r.trigger}</TableCell>
                <TableCell>
                  <Badge variant={r.status === "failed" ? "destructive" : "secondary"}>{r.status}</Badge>
                </TableCell>
                <TableCell className="max-w-xl truncate text-muted-foreground">{r.summary ?? r.error ?? "—"}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
