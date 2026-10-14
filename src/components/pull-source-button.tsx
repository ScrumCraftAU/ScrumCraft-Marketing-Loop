"use client";

import { useTransition } from "react";
import { Loader2, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { pullSourceNow, type PulledSource } from "@/app/actions";

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
