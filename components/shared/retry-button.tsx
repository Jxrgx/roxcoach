"use client";

import { RefreshCw } from "lucide-react";
import { Button, type ButtonVariant } from "@/components/ui/button";

/** Ruta interna segura (nunca otro origen ni "//"). */
function safeInternal(path: string | null): string | null {
  return path && path.startsWith("/") && !path.startsWith("//") && !path.includes("\\") ? path : null;
}

/** Vuelve a intentar la ruta que se pidió sin red (?desde=) o recarga. */
export function RetryButton({ variant = "primary" }: { variant?: ButtonVariant }) {
  return (
    <Button
      variant={variant}
      icon={<RefreshCw aria-hidden className="size-4" />}
      onClick={() => {
        const target = safeInternal(new URLSearchParams(window.location.search).get("desde"));
        if (target) window.location.assign(target);
        else window.location.reload();
      }}
    >
      Reintentar
    </Button>
  );
}
