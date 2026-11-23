"use client";

import { useTransition } from "react";
import { Check, CheckCheck } from "lucide-react";
import { markAlertReadAction, markAllAlertsReadAction } from "@/app/coach/avisos/actions";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";

/** Marca un aviso como leído (se conserva en el historial de "Leídos"). */
export function MarkReadButton({ id, title }: { id: string; title: string }) {
  const [pending, startTransition] = useTransition();
  const toast = useToast();
  return (
    <Button
      variant="ghost"
      icon={<Check aria-hidden className="size-4" />}
      loading={pending}
      loadingLabel="Marcando…"
      aria-label={`Marcar leído: ${title}`}
      onClick={() =>
        startTransition(async () => {
          const result = await markAlertReadAction(id);
          if (!result.ok) toast.show({ tone: "error", title: "No se marcó el aviso", description: result.message });
        })
      }
    >
      Marcar leído
    </Button>
  );
}

/** Acción principal de la bandeja: marcar todos los avisos visibles como leídos. */
export function MarkAllReadButton({ count }: { count: number }) {
  const [pending, startTransition] = useTransition();
  const toast = useToast();
  return (
    <Button
      fullWidth
      className="sm:w-auto"
      disabled={count === 0}
      icon={<CheckCheck aria-hidden className="size-4" />}
      loading={pending}
      loadingLabel="Marcando…"
      onClick={() =>
        startTransition(async () => {
          const result = await markAllAlertsReadAction();
          toast.show(result.ok ? { tone: "success", title: "Todos los avisos están leídos" } : { tone: "error", title: "No se marcaron los avisos", description: result.message });
        })
      }
    >
      Marcar todos como leídos
    </Button>
  );
}
