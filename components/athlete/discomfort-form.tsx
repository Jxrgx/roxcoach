"use client";

import { useState, useTransition, type FormEvent } from "react";
import { reportDiscomfortAction } from "@/app/atleta/sesiones/actions";
import { DISCOMFORT_INTENSITIES, DISCOMFORT_INTENSITY_LABEL, DISCOMFORT_ZONES, DISCOMFORT_ZONE_LABEL } from "@/lib/execution/discomfort";
import { validateDiscomfort, type DiscomfortInput, type FieldErrors } from "@/lib/validations";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { Select, Textarea } from "@/components/ui/field";
import { useToast } from "@/components/ui/toast";

const EMPTY: DiscomfortInput = { zone: "", intensity: "", note: "" };

/**
 * Reporte de molestia o dolor: zona, intensidad y nota opcional.
 * Se liga al ejercicio en curso si lo hay. El coach lo ve en los resultados.
 */
export function DiscomfortDialog({
  open,
  onClose,
  sessionId,
  at,
  exerciseName,
}: {
  open: boolean;
  onClose: () => void;
  sessionId: string;
  at: { blockIndex: number; exerciseIndex: number } | null;
  exerciseName?: string;
}) {
  const [values, setValues] = useState<DiscomfortInput>(EMPTY);
  const [errors, setErrors] = useState<FieldErrors<keyof DiscomfortInput>>({});
  const [message, setMessage] = useState("");
  const [pending, startTransition] = useTransition();
  const toast = useToast();

  function submit(e: FormEvent) {
    e.preventDefault();
    const local = validateDiscomfort(values);
    if (!local.ok) {
      setErrors(local.errors);
      return;
    }
    setErrors({});
    setMessage("");
    startTransition(async () => {
      const result = await reportDiscomfortAction(sessionId, values, at);
      if (!result.ok) {
        setErrors(result.errors ?? {});
        setMessage(result.message ?? "");
        return;
      }
      setValues(EMPTY);
      onClose();
      toast.show({ tone: "success", title: "Molestia reportada", description: "Tu coach la verá en tus resultados. Si el dolor es fuerte, detente." });
    });
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Reportar molestia"
      description={exerciseName ? `Durante: ${exerciseName}` : "Cuéntale a tu coach qué sientes."}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={pending} fullWidth className="sm:w-auto">
            Cancelar
          </Button>
          <Button type="submit" form="discomfort-form" loading={pending} loadingLabel="Enviando…" fullWidth className="sm:w-auto">
            Enviar reporte
          </Button>
        </>
      }
    >
      <form id="discomfort-form" onSubmit={submit} noValidate className="flex flex-col gap-4">
        <Select label="Zona" value={values.zone} onChange={(e) => setValues((v) => ({ ...v, zone: e.target.value }))} error={errors.zone}>
          <option value="">Elige una zona</option>
          {DISCOMFORT_ZONES.map((z) => (
            <option key={z} value={z}>
              {DISCOMFORT_ZONE_LABEL[z]}
            </option>
          ))}
        </Select>
        <fieldset>
          <legend className="text-sm font-medium text-ink">Intensidad</legend>
          <div className="mt-2 grid grid-cols-3 gap-2">
            {DISCOMFORT_INTENSITIES.map((level) => (
              <label key={level} className="relative">
                <input
                  type="radio"
                  name="discomfort-intensity"
                  value={level}
                  checked={values.intensity === level}
                  onChange={() => setValues((v) => ({ ...v, intensity: level }))}
                  className="peer sr-only"
                />
                <span className="flex min-h-11 cursor-pointer items-center justify-center rounded-xl border border-line bg-surface-2 px-2 font-semibold text-ink peer-checked:border-warning peer-checked:bg-warning/15 peer-focus-visible:outline-2 peer-focus-visible:outline-electric">
                  {DISCOMFORT_INTENSITY_LABEL[level]}
                </span>
              </label>
            ))}
          </div>
          {errors.intensity && (
            <p role="alert" className="mt-1.5 text-sm text-danger">
              {errors.intensity}
            </p>
          )}
        </fieldset>
        <Textarea
          label="Nota"
          optional
          rows={3}
          maxLength={500}
          value={values.note}
          onChange={(e) => setValues((v) => ({ ...v, note: e.target.value }))}
          error={errors.note}
          placeholder="Por ejemplo: punzada al empujar el trineo."
        />
        {message && (
          <p role="alert" className="text-sm text-danger">
            {message}
          </p>
        )}
      </form>
    </Modal>
  );
}
