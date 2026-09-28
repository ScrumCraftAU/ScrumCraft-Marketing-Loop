"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Play } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { runLoopNow } from "@/app/actions";

export function RunLoopButton() {
  const [pending, start] = useTransition();
  const router = useRouter();

  return (
    <Button
      disabled={pending}
      onClick={() =>
        start(async () => {
          const res = await runLoopNow();
          if (res.ok) {
            toast.success("Loop run complete");
            router.push(`/loop/${res.runId}`);
          } else {
            toast.error(res.error);
          }
        })
      }
    >
      {pending ? <Loader2 className="animate-spin" /> : <Play />}
      {pending ? "Running loop…" : "Run loop now"}
    </Button>
  );
}
