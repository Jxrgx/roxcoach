"use client";

import { useTransition } from "react";
import { Play } from "lucide-react";
import { startSessionAction } from "@/app/atleta/sesiones/actions";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";

/** "Comenzar": crea el registro de la ejecución y abre la serie activa. */
export function StartSessionButton({ sessionId }: { sessionId: string }) {
  const [pending, startTransition] = useTransition();
  const toast = useToast();
  return (
    <Button
      size="lg"
      fullWidth
      className="sm:w-auto"
      icon={<Play aria-hidden className="size-5" />}
      loading={pending}
      loadingLabel="Comenzando…"
      onClick={() =>
        startTransition(async () => {
          // Si todo sale bien, la acción redirige a la ejecución.
          const result = await startSessionAction(sessionId);
          if (!result.ok) toast.show({ tone: "error", title: "No se pudo comenzar", description: result.message });
        })
      }
    >
      Comenzar
    </Button>
  );
}
