"use client";

import { AlertTriangle, RotateCw } from "lucide-react";
import type { ReactNode } from "react";
import { StateMessage } from "@/components/ui/state-message";
import { Button } from "@/components/ui/button";

interface ErrorStateProps {
  title?: string;
  description?: string;
  onRetry?: () => void;
  retryLabel?: string;
  extraAction?: ReactNode;
  className?: string;
}

/** Error recuperable: mensaje claro en lenguaje humano y opción de reintentar. */
export function ErrorState({
  title = "No pudimos cargar esta información",
  description = "Revisa tu conexión e inténtalo de nuevo. Si el problema continúa, avísanos.",
  onRetry,
  retryLabel = "Reintentar",
  extraAction,
  className,
}: ErrorStateProps) {
  return (
    <StateMessage
      role="alert"
      tone="danger"
      icon={<AlertTriangle />}
      title={title}
      description={description}
      className={className}
      action={
        onRetry || extraAction ? (
          <>
            {onRetry && (
              <Button variant="secondary" icon={<RotateCw aria-hidden className="size-4" />} onClick={onRetry}>
                {retryLabel}
              </Button>
            )}
            {extraAction}
          </>
        ) : undefined
      }
    />
  );
}
