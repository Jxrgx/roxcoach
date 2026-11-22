"use client";

import { useState, useTransition, type FormEvent } from "react";
import { saveFeedbackAction } from "@/app/atleta/sesiones/actions";
import { validateSessionFeedback, type FieldErrors, type SessionFeedbackInput } from "@/lib/validations";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/field";
import { useToast } from "@/components/ui/toast";
import { RpePicker } from "@/components/athlete/rpe-picker";

/** RPE general y comentario: lo único editable después de finalizar. */
export function SessionFeedbackForm({ sessionId, initial }: { sessionId: string; initial: SessionFeedbackInput }) {
  const [values, setValues] = useState<SessionFeedbackInput>(initial);
  const [saved, setSaved] = useState(initial.rpe !== "" || initial.comment !== "");
  const [errors, setErrors] = useState<FieldErrors<keyof SessionFeedbackInput>>({});
  const [message, setMessage] = useState("");
  const [pending, startTransition] = useTransition();
  const toast = useToast();

  function submit(e: FormEvent) {
    e.preventDefault();
    const local = validateSessionFeedback(values);
    if (!local.ok) {
      setErrors(local.errors);
      return;
    }
    setErrors({});
    setMessage("");
    startTransition(async () => {
      const result = await saveFeedbackAction(sessionId, values);
      if (!result.ok) {
        setErrors(result.errors ?? {});
        setMessage(result.message ?? "");
        return;
      }
      setSaved(true);
      toast.show({ tone: "success", title: "Enviado a tu coach" });
    });
  }

  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-4 rounded-2xl border border-line bg-surface p-4 sm:p-5" aria-labelledby="cierre-titulo">
      <h2 id="cierre-titulo" className="text-lg font-semibold text-ink">
        ¿Cómo te fue?
      </h2>
      <RpePicker legend="Esfuerzo general de la sesión (RPE)" value={values.rpe} onChange={(rpe) => setValues((v) => ({ ...v, rpe }))} error={errors.rpe} />
      <Textarea
        label="Comentario para tu coach"
        optional
        rows={3}
        maxLength={1000}
        value={values.comment}
        onChange={(e) => setValues((v) => ({ ...v, comment: e.target.value }))}
        error={errors.comment}
      />
      {message && (
        <p role="alert" className="text-sm text-danger">
          {message}
        </p>
      )}
      <Button type="submit" size="lg" fullWidth className="sm:w-auto sm:self-end" loading={pending} loadingLabel="Enviando…">
        {saved ? "Actualizar" : "Enviar a mi coach"}
      </Button>
    </form>
  );
}
