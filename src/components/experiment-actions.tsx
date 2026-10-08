"use client";

import { useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { setExperimentStatus } from "@/app/actions";
import type { ExperimentStatus } from "@/lib/types";

const NEXT: Record<ExperimentStatus, { to: ExperimentStatus; label: string }[]> = {
  proposed: [{ to: "approved", label: "Approve" }, { to: "done", label: "Mark done" }, { to: "rejected", label: "Reject" }],
  approved: [{ to: "running", label: "Start" }, { to: "done", label: "Mark done" }],
  running: [{ to: "checking", label: "Check now" }, { to: "done", label: "Mark done" }],
  checking: [
    { to: "adopted", label: "Adopt" },
    { to: "adapted", label: "Adapt" },
    { to: "abandoned", label: "Abandon" },
  ],
  adopted: [],
  adapted: [],
  abandoned: [],
  rejected: [],
  done: [],
};

export function ExperimentActions({ id, status }: { id: string; status: ExperimentStatus }) {
  const [pending, start] = useTransition();
  const options = NEXT[status];
  if (!options.length) return null;

  return (
    <div className="flex flex-wrap gap-2">
      {options.map((o) => (
        <Button
          key={o.to}
          size="sm"
          variant="outline"
          disabled={pending}
          onClick={() =>
            start(async () => {
              const res = await setExperimentStatus(id, o.to);
              if (!res.ok) toast.error(res.error);
            })
          }
        >
          {o.label}
        </Button>
      ))}
    </div>
  );
}
