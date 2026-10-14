"use client";

import { useTransition } from "react";
import { Loader2, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { pullHubSpotNow } from "@/app/actions";

export function PullHubSpotButton() {
  const [pending, start] = useTransition();
  return (
    <Button
      variant="outline"
      size="sm"
      disabled={pending}
      onClick={() =>
        start(async () => {
          const res = await pullHubSpotNow();
          if (!res.ok) toast.error(res.error);
          else if (res.warnings.length) toast.warning(`Stored ${res.stored} values for ${res.days} days; ${res.warnings.join("; ")}`);
          else toast.success(`Stored ${res.stored} HubSpot values for the last ${res.days} days`);
        })
      }
    >
      {pending ? <Loader2 className="animate-spin" /> : <RefreshCw />}
      Pull now
    </Button>
  );
}
