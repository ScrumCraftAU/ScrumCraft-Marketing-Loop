"use client";

import { useTransition } from "react";
import { Loader2, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { refreshStrategyDocsNow } from "@/app/actions";

export function RefreshDocsButton() {
  const [pending, start] = useTransition();
  return (
    <Button
      variant="outline"
      size="sm"
      disabled={pending}
      onClick={() =>
        start(async () => {
          const res = await refreshStrategyDocsNow();
          if (!res.ok) toast.error(res.error);
          else if (res.failed.length) toast.warning(`Refreshed ${res.refreshed}; failed: ${res.failed.join(", ")}`);
          else toast.success(`Refreshed ${res.refreshed} docs from Confluence`);
        })
      }
    >
      {pending ? <Loader2 className="animate-spin" /> : <RefreshCw />}
      Refresh from Confluence
    </Button>
  );
}
