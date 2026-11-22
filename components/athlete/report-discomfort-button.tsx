"use client";

import { useState } from "react";
import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DiscomfortDialog } from "@/components/athlete/discomfort-form";

/** Reportar una molestia desde el resumen (sin ejercicio asociado). */
export function ReportDiscomfortButton({ sessionId }: { sessionId: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant="secondary" onClick={() => setOpen(true)} icon={<AlertTriangle aria-hidden className="size-4 text-warning" />}>
        Reportar molestia
      </Button>
      <DiscomfortDialog open={open} onClose={() => setOpen(false)} sessionId={sessionId} at={null} />
    </>
  );
}
