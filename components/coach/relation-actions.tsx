"use client";

import { useState } from "react";
import { PauseCircle, PlayCircle } from "lucide-react";
import { pauseAthlete, reactivateAthlete } from "@/app/coach/atletas/actions";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { useToast } from "@/components/ui/toast";

/**
 * Pausar (con confirmación) o reactivar la relación con un atleta.
 * Reactivar es la acción principal cuando la relación está en pausa.
 */
export function RelationActions({ athleteId, athleteName, status }: { athleteId: string; athleteName: string; status: "active" | "paused" }) {
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const toast = useToast();

  async function run(action: "pause" | "reactivate") {
    setBusy(true);
    const result = action === "pause" ? await pauseAthlete(athleteId) : await reactivateAthlete(athleteId);
    setBusy(false);
    setConfirm(false);
    if (!result.ok) {
      toast.show({ tone: "error", title: "No se cambió el estado", description: result.message });
      return;
    }
    toast.show({
      tone: "success",
      title: action === "pause" ? `${athleteName} quedó en pausa` : `${athleteName} está activo de nuevo`,
    });
  }

  if (status === "paused") {
    return (
      <Button onClick={() => run("reactivate")} loading={busy} loadingLabel="Reactivando…" icon={<PlayCircle aria-hidden className="size-5" />} fullWidth className="sm:w-auto">
        Reactivar atleta
      </Button>
    );
  }

  return (
    <>
      <Button variant="secondary" onClick={() => setConfirm(true)} icon={<PauseCircle aria-hidden className="size-5" />} fullWidth className="sm:w-auto">
        Pausar atleta
      </Button>
      <ConfirmDialog
        open={confirm}
        onClose={() => !busy && setConfirm(false)}
        onConfirm={() => run("pause")}
        loading={busy}
        tone="default"
        title={`¿Pausar a ${athleteName}?`}
        description="Seguirá en tu equipo, pero no podrás editar su información hasta reactivarlo. Su historial se conserva."
        confirmLabel="Sí, pausar"
        cancelLabel="Volver"
      />
    </>
  );
}
