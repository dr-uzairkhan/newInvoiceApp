"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { clearProjectAlertScheduleAction } from "@/actions/projectAlertSchedule.actions";

/**
 * M29 — used by the project detail page's alert list. No confirmation
 * dialog: clearing is non-destructive (a recurring schedule re-arms itself
 * next month; a cleared one-time schedule's config row stays
 * visible/editable, nothing is deleted). The server action revalidates every
 * server-rendered surface that reads the fired set (project page, dashboard
 * planner, Projects list), so one Clear reflects everywhere.
 */
export function ClearAlertScheduleButton({
  scheduleId,
  projectId,
  className,
}: {
  scheduleId: string;
  projectId: string;
  className?: string;
}) {
  const router = useRouter();
  const [isPending, setIsPending] = useState(false);

  return (
    <Button
      variant="outline"
      className={cn("h-7 shrink-0 px-2.5 text-[11px]", className)}
      disabled={isPending}
      onClick={async () => {
        setIsPending(true);
        try {
          const result = await clearProjectAlertScheduleAction(
            scheduleId,
            projectId,
          );
          if (!result.success) {
            toast.error(result.error);
            return;
          }
          toast.success("Alert cleared");
          router.refresh();
        } finally {
          setIsPending(false);
        }
      }}
    >
      {isPending ? "Clearing…" : "Clear"}
    </Button>
  );
}
