"use client";

import { useState, useTransition, type FormEvent } from "react";
import { AlertTriangle, CalendarX2, ChevronRight, Pencil, UserMinus, UserPlus } from "lucide-react";
import type { ExecutionStatus } from "@/lib/execution/progress";
import { Badge } from "@/components/ui/badge";
import { ExecutionStatusBadge } from "@/components/workouts/execution-status";
import { addAthletesAction, cancelSessionAction, removeAthleteAction, updateSessionDetailsAction } from "@/app/coach/sesiones/actions";
import { hasErrors, validateSessionDetails, type FieldErrors, type SessionDetailsInput } from "@/lib/validations";
import { Button, ButtonLink } from "@/components/ui/button";
import { Input, Textarea } from "@/components/ui/field";
import { Modal } from "@/components/ui/modal";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { useToast } from "@/components/ui/toast";
import { Avatar } from "@/components/shared/avatar";
import { AthleteMultiSelect, type SelectableAthlete } from "@/components/coach/athlete-multi-select";

/* ---------- Editar detalles y cancelar ---------- */

export function SessionHeaderActions({
  sessionId,
  title,
  details,
  today,
  maxDate,
}: {
  sessionId: string;
  title: string;
  details: SessionDetailsInput;
  today: string;
  maxDate: string;
}) {
  const [editOpen, setEditOpen] = useState(false);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [values, setValues] = useState<SessionDetailsInput>(details);
  const [errors, setErrors] = useState<FieldErrors<keyof SessionDetailsInput>>({});
  const [pending, startTransition] = useTransition();
  const toast = useToast();

  function save(e: FormEvent) {
    e.preventDefault();
    const found = validateSessionDetails(values, { today, maxDate });
    setErrors(found);
    if (hasErrors(found)) return;
    startTransition(async () => {
      const result = await updateSessionDetailsAction(sessionId, values);
      if (!result.ok) {
        if (result.errors) setErrors(result.errors);
        toast.show({ tone: "error", title: "No se guardaron los cambios", description: result.message });
        return;
      }
      setEditOpen(false);
      toast.show({ tone: "success", title: "Sesión actualizada", description: "Tus atletas verán los cambios en su agenda." });
    });
  }

  function cancel() {
    startTransition(async () => {
      const result = await cancelSessionAction(sessionId);
      setConfirmCancel(false);
      toast.show(
        result.ok
          ? { tone: "success", title: "Sesión cancelada", description: "Tus atletas la verán como cancelada." }
          : { tone: "error", title: "No se canceló la sesión", description: result.message },
      );
    });
  }

  return (
    <>
      <div className="flex flex-col gap-2 sm:flex-row">
        <Button variant="ghost" onClick={() => setConfirmCancel(true)} icon={<CalendarX2 aria-hidden className="size-4" />} fullWidth className="sm:w-auto">
          Cancelar sesión
        </Button>
        <Button
          onClick={() => {
            setValues(details);
            setErrors({});
            setEditOpen(true);
          }}
          icon={<Pencil aria-hidden className="size-4" />}
          fullWidth
          className="sm:w-auto"
          aria-haspopup="dialog"
        >
          Editar detalles
        </Button>
      </div>

      <Modal
        open={editOpen}
        onClose={() => !pending && setEditOpen(false)}
        title="Editar detalles"
        description="La plantilla congelada no cambia; solo fecha, hora, título y notas."
        footer={
          <>
            <Button variant="ghost" onClick={() => setEditOpen(false)} disabled={pending} fullWidth className="sm:w-auto">
              Volver
            </Button>
            <Button type="submit" form="session-details-form" loading={pending} fullWidth className="sm:w-auto">
              Guardar cambios
            </Button>
          </>
        }
      >
        <form id="session-details-form" onSubmit={save} noValidate className="flex flex-col gap-4">
          <Input label="Título" value={values.title} onChange={(e) => setValues((v) => ({ ...v, title: e.target.value }))} error={errors.title} maxLength={80} />
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Input label="Fecha" type="date" min={today} max={maxDate} value={values.date} onChange={(e) => setValues((v) => ({ ...v, date: e.target.value }))} error={errors.date} />
            <Input label="Hora de inicio" optional type="time" value={values.time} onChange={(e) => setValues((v) => ({ ...v, time: e.target.value }))} error={errors.time} />
          </div>
          <Textarea label="Notas para los atletas" optional rows={3} value={values.notes} onChange={(e) => setValues((v) => ({ ...v, notes: e.target.value }))} error={errors.notes} maxLength={500} />
        </form>
      </Modal>

      <ConfirmDialog
        open={confirmCancel}
        onClose={() => !pending && setConfirmCancel(false)}
        onConfirm={cancel}
        loading={pending}
        title={`¿Cancelar “${title}”?`}
        description="Tus atletas la verán como cancelada en su agenda. No se borra: queda en el historial."
        confirmLabel="Sí, cancelar sesión"
        cancelLabel="Volver"
      />
    </>
  );
}

/* ---------- Atletas asignados ---------- */

export function SessionAthletes({
  sessionId,
  assigned,
  assignable,
  editable,
}: {
  sessionId: string;
  assigned: (SelectableAthlete & { execution?: ExecutionStatus; discomfortCount?: number })[];
  /** Atletas activos que aún no están en la sesión. */
  assignable: SelectableAthlete[];
  editable: boolean;
}) {
  const [addOpen, setAddOpen] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);
  const [removing, setRemoving] = useState<SelectableAthlete | null>(null);
  const [pending, startTransition] = useTransition();
  const toast = useToast();

  function add() {
    if (selected.length === 0) return;
    startTransition(async () => {
      const result = await addAthletesAction(sessionId, selected);
      if (!result.ok) {
        toast.show({ tone: "error", title: "No se agregaron atletas", description: result.message });
        return;
      }
      setAddOpen(false);
      setSelected([]);
      toast.show({ tone: "success", title: selected.length === 1 ? "Atleta agregado" : `${selected.length} atletas agregados` });
    });
  }

  function remove() {
    if (!removing) return;
    const athlete = removing;
    startTransition(async () => {
      const result = await removeAthleteAction(sessionId, athlete.athleteId);
      setRemoving(null);
      toast.show(
        result.ok
          ? { tone: "success", title: `${athlete.name} ya no está en esta sesión` }
          : { tone: "error", title: "No se quitó al atleta", description: result.message },
      );
    });
  }

  return (
    <section aria-labelledby="asignados" className="rounded-2xl border border-line bg-surface p-4 sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 id="asignados" className="text-base font-semibold text-ink">
            Atletas asignados <span className="font-normal text-muted">({assigned.length})</span>
          </h2>
          {assigned.length > 0 && (
            <p className="text-sm text-muted">
              {assigned.filter((a) => a.execution === "completada").length} de {assigned.length} completaron la sesión
            </p>
          )}
        </div>
        {editable && (
          <Button
            variant="secondary"
            onClick={() => setAddOpen(true)}
            disabled={assignable.length === 0}
            icon={<UserPlus aria-hidden className="size-4" />}
            aria-haspopup="dialog"
          >
            Agregar atletas
          </Button>
        )}
      </div>
      {editable && assignable.length === 0 && <p className="mt-2 text-sm text-muted">Todos tus atletas activos ya están en esta sesión.</p>}

      {assigned.length === 0 ? (
        <p className="mt-3 text-sm text-muted">No hay atletas asignados.</p>
      ) : (
        <ul className="mt-3 divide-y divide-line">
          {assigned.map((a) => {
            const started = a.execution !== undefined && a.execution !== "sin_iniciar";
            return (
              <li key={a.athleteId} className="flex flex-wrap items-center gap-x-3 gap-y-2 py-2.5">
                <Avatar name={a.name} size="sm" />
                <span className="min-w-0 flex-1">
                  <span className="block font-medium text-ink">{a.name}</span>
                  <span className="block text-sm text-muted">{a.division || "División sin definir"}</span>
                </span>
                <span className="flex flex-wrap items-center gap-1.5">
                  {a.execution && <ExecutionStatusBadge status={a.execution} />}
                  {(a.discomfortCount ?? 0) > 0 && (
                    <Badge tone="warning" icon={<AlertTriangle aria-hidden />}>
                      {a.discomfortCount === 1 ? "1 molestia" : `${a.discomfortCount} molestias`}
                    </Badge>
                  )}
                </span>
                {started ? (
                  <ButtonLink
                    href={`/coach/sesiones/${sessionId}/atletas/${a.athleteId}`}
                    variant="ghost"
                    icon={<ChevronRight aria-hidden className="size-4" />}
                    aria-label={`Ver resultados de ${a.name}`}
                  >
                    Resultados
                  </ButtonLink>
                ) : (
                  editable && (
                    <Button variant="ghost" onClick={() => setRemoving(a)} icon={<UserMinus aria-hidden className="size-4" />} aria-label={`Quitar a ${a.name} de la sesión`}>
                      Quitar
                    </Button>
                  )
                )}
              </li>
            );
          })}
        </ul>
      )}

      <Modal
        open={addOpen}
        onClose={() => !pending && setAddOpen(false)}
        title="Agregar atletas"
        description="Recibirán la misma sesión congelada."
        footer={
          <>
            <Button variant="ghost" onClick={() => setAddOpen(false)} disabled={pending} fullWidth className="sm:w-auto">
              Volver
            </Button>
            <Button onClick={add} loading={pending} disabled={selected.length === 0} fullWidth className="sm:w-auto">
              Agregar{selected.length ? ` (${selected.length})` : ""}
            </Button>
          </>
        }
      >
        <AthleteMultiSelect athletes={assignable} value={selected} onChange={setSelected} legend="Atletas por agregar" />
      </Modal>

      <ConfirmDialog
        open={removing !== null}
        onClose={() => !pending && setRemoving(null)}
        onConfirm={remove}
        loading={pending}
        tone="default"
        title={`¿Quitar a ${removing?.name ?? ""}?`}
        description="Ya no verá esta sesión en su agenda. Puedes volver a agregarlo mientras la sesión esté programada."
        confirmLabel="Sí, quitar"
        cancelLabel="Volver"
      />
    </section>
  );
}
