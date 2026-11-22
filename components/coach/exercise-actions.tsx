"use client";

import { useState, useTransition } from "react";
import { Archive, ArchiveRestore, Copy, Pencil } from "lucide-react";
import { archiveExerciseAction, duplicateExerciseAction, restoreExerciseAction } from "@/app/coach/biblioteca/actions";
import { Button, ButtonLink } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { useToast } from "@/components/ui/toast";

interface ExerciseActionsProps {
  id: string;
  name: string;
  origin: "system" | "own";
  archived: boolean;
}

/**
 * Acciones del detalle según propiedad:
 * - Sistema: "Duplicar como propio" (acción principal).
 * - Propio activo: "Editar" (principal) y "Archivar" (con confirmación).
 * - Propio archivado: "Restaurar" (principal).
 */
export function ExerciseActions({ id, name, origin, archived }: ExerciseActionsProps) {
  const [confirm, setConfirm] = useState(false);
  const [pending, startTransition] = useTransition();
  const toast = useToast();

  const run = (action: () => Promise<{ ok: boolean; message?: string }>, success?: string) =>
    startTransition(async () => {
      const result = await action();
      setConfirm(false);
      if (!result.ok) toast.show({ tone: "error", title: "No se completó la acción", description: result.message });
      else if (success) toast.show({ tone: "success", title: success });
    });

  if (origin === "system") {
    return (
      <Button
        onClick={() => run(() => duplicateExerciseAction(id))}
        loading={pending}
        loadingLabel="Duplicando…"
        icon={<Copy aria-hidden className="size-5" />}
        fullWidth
        className="sm:w-auto"
      >
        Duplicar como propio
      </Button>
    );
  }

  if (archived) {
    return (
      <Button
        onClick={() => run(() => restoreExerciseAction(id), "Ejercicio restaurado")}
        loading={pending}
        loadingLabel="Restaurando…"
        icon={<ArchiveRestore aria-hidden className="size-5" />}
        fullWidth
        className="sm:w-auto"
      >
        Restaurar
      </Button>
    );
  }

  return (
    <>
      <Button variant="secondary" onClick={() => setConfirm(true)} icon={<Archive aria-hidden className="size-5" />} fullWidth className="sm:w-auto">
        Archivar
      </Button>
      <ButtonLink href={`/coach/biblioteca/${id}/editar`} icon={<Pencil aria-hidden className="size-5" />} fullWidth className="sm:w-auto">
        Editar
      </ButtonLink>
      <ConfirmDialog
        open={confirm}
        onClose={() => !pending && setConfirm(false)}
        onConfirm={() => run(() => archiveExerciseAction(id), "Ejercicio archivado")}
        loading={pending}
        tone="default"
        title={`¿Archivar “${name}”?`}
        description="Dejará de aparecer en tu biblioteca y no podrá elegirse como sustitución. No se borra: puedes restaurarlo desde el filtro Archivados."
        confirmLabel="Sí, archivar"
        cancelLabel="Volver"
      />
    </>
  );
}
