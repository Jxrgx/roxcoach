"use client";

import { useState, useTransition } from "react";
import { Archive, ArchiveRestore, Copy, Pencil, Send, Undo2 } from "lucide-react";
import {
  archiveTemplateAction,
  duplicateTemplateAction,
  publishTemplateAction,
  restoreTemplateAction,
  unpublishTemplateAction,
} from "@/app/coach/entrenamientos/actions";
import type { TemplateStatusValue } from "@/lib/workouts/rules";
import { Button, ButtonLink } from "@/components/ui/button";
import { NewSessionButton } from "@/components/coach/new-session";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { useToast } from "@/components/ui/toast";

type Result = { ok: true } | { ok: false; message?: string; problems?: string[] };

/**
 * Acciones del detalle según estado (una sola acción principal):
 * - Borrador: "Publicar" (principal) · Editar · Duplicar · Archivar.
 * - Publicada: "Programar" (principal) · Editar · Pasar a borrador · Duplicar · Archivar.
 * - Archivada: "Restaurar" (principal, vuelve a borrador).
 */
export function TemplateActions({ id, name, status }: { id: string; name: string; status: TemplateStatusValue }) {
  const [confirmArchive, setConfirmArchive] = useState(false);
  const [pending, startTransition] = useTransition();
  const toast = useToast();

  const run = (action: () => Promise<Result>, success?: string) =>
    startTransition(async () => {
      const result = await action();
      setConfirmArchive(false);
      if (!result.ok) {
        // Lo que falta va en el toast (estado global): el detalle además lo
        // lista de forma persistente en "Borrador: para publicarla falta".
        toast.show({
          tone: "error",
          title: result.message ?? "No se completó la acción",
          description: result.problems?.length ? `Falta: ${result.problems.join(" ")}` : undefined,
        });
        return;
      }
      if (success) toast.show({ tone: "success", title: success });
    });

  const duplicate = (
    <Button
      variant="ghost"
      onClick={() => run(() => duplicateTemplateAction(id))}
      disabled={pending}
      icon={<Copy aria-hidden className="size-4" />}
      fullWidth
      className="sm:w-auto"
    >
      Duplicar
    </Button>
  );
  const archive = (
    <Button variant="ghost" onClick={() => setConfirmArchive(true)} disabled={pending} icon={<Archive aria-hidden className="size-4" />} fullWidth className="sm:w-auto">
      Archivar
    </Button>
  );

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:justify-end">
        {status === "archivada" ? (
          <Button
            onClick={() => run(() => restoreTemplateAction(id), "Plantilla restaurada como borrador")}
            loading={pending}
            loadingLabel="Restaurando…"
            icon={<ArchiveRestore aria-hidden className="size-5" />}
            fullWidth
            className="sm:w-auto"
          >
            Restaurar
          </Button>
        ) : (
          <>
            {duplicate}
            {archive}
            {status === "publicada" && (
              <Button
                variant="secondary"
                onClick={() => run(() => unpublishTemplateAction(id), "La plantilla volvió a borrador")}
                disabled={pending}
                icon={<Undo2 aria-hidden className="size-4" />}
                fullWidth
                className="sm:w-auto"
              >
                Pasar a borrador
              </Button>
            )}
            <ButtonLink
              href={`/coach/entrenamientos/${id}/editar`}
              variant="secondary"
              icon={<Pencil aria-hidden className="size-4" />}
              fullWidth
              className="sm:w-auto"
            >
              Editar
            </ButtonLink>
            {status === "publicada" && <NewSessionButton templateId={id} label="Programar" fullWidth className="sm:w-auto" />}
            {status === "borrador" && (
              <Button
                onClick={() => run(() => publishTemplateAction(id), "Plantilla publicada")}
                loading={pending}
                loadingLabel="Publicando…"
                icon={<Send aria-hidden className="size-5" />}
                fullWidth
                className="sm:w-auto"
              >
                Publicar
              </Button>
            )}
          </>
        )}
      </div>


      <ConfirmDialog
        open={confirmArchive}
        onClose={() => !pending && setConfirmArchive(false)}
        onConfirm={() => run(() => archiveTemplateAction(id), "Plantilla archivada")}
        loading={pending}
        tone="default"
        title={`¿Archivar “${name}”?`}
        description="Dejará de aparecer entre tus plantillas activas. No se borra: puedes restaurarla desde Archivadas."
        confirmLabel="Sí, archivar"
        cancelLabel="Volver"
      />
    </div>
  );
}
