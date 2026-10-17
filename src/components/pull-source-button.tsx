"use client";

import { useTransition } from "react";
import { Loader2, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { backfillHubSpot, pullSourceNow, type PulledSource } from "@/app/actions";

/** One-off: pulls a year of HubSpot history so the loop's 90-day and source views have data. */
export function BackfillHubSpotButton() {
  const [pending, start] = useTransition();
  return (
    <Button
      variant="outline"
      size="sm"
      disabled={pending}
      onClick={() =>
        start(async () => {
          const res = await backfillHubSpot();
          if (!res.ok) toast.error(res.error);
          else if (res.warnings.length) toast.warning(`Stored ${res.stored} values for ${res.days} days; ${res.warnings.join("; ")}`);
          else toast.success(`Stored ${res.stored} HubSpot values for the last ${res.days} days`);
        })
      }
    >
      {pending ? <Loader2 className="animate-spin" /> : <RefreshCw />}
      {pending ? "Backfilling a year…" : "Backfill a year"}
    </Button>
  );
}

export function PullSourceButton({ source, label }: { source: PulledSource; label: string }) {
  const [pending, start] = useTransition();
  return (
    <Button
      variant="outline"
      size="sm"
      disabled={pending}
      onClick={() =>
        start(async () => {
          const res = await pullSourceNow(source);
          if (!res.ok) toast.error(res.error);
          else if (res.warnings.length) toast.warning(`Stored ${res.stored} values for ${res.days} days; ${res.warnings.join("; ")}`);
          else toast.success(`Stored ${res.stored} ${label} values for the last ${res.days} days`);
        })
      }
    >
      {pending ? <Loader2 className="animate-spin" /> : <RefreshCw />}
      Pull now
    </Button>
  );
}
