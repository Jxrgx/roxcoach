"use client";

import { useState, type FormEvent } from "react";
import { CalendarCheck } from "lucide-react";
import { scheduleSessionAction } from "@/app/coach/sesiones/actions";
import { hasErrors, validateSchedule, type FieldErrors, type ScheduleInput } from "@/lib/validations";
import { formatDuration, INTENSITY_LABEL } from "@/lib/utils/format";
import type { WorkoutIntensityValue } from "@/lib/workouts/rules";
import { Input, Select, Textarea } from "@/components/ui/field";
import { Button, ButtonLink } from "@/components/ui/button";
import { FormSection } from "@/components/ui/form-controls";
import { useToast } from "@/components/ui/toast";
import { StickyActions } from "@/components/shared/sticky-actions";
import { AthleteMultiSelect, type SelectableAthlete } from "@/components/coach/athlete-multi-select";

export interface SchedulableTemplate {
  id: string;
  name: string;
  estimatedMinutes: number | null;
  intensity: WorkoutIntensityValue;
}

interface ScheduleFormProps {
  templates: SchedulableTemplate[];
  athletes: SelectableAthlete[];
  initialTemplateId: string;
  /** "YYYY-MM-DD" en la zona de la app. */
  today: string;
  maxDate: string;
}

/**
 * Programar una plantilla publicada: plantilla → fecha y hora → título y
 * notas → atletas. Al guardar se congela la plantilla (snapshot).
 */
export function ScheduleForm({ templates, athletes, initialTemplateId, today, maxDate }: ScheduleFormProps) {
  const initialTemplate = templates.find((t) => t.id === initialTemplateId);
  const [values, setValues] = useState<ScheduleInput>({
    templateId: initialTemplate?.id ?? "",
    date: today,
    time: "",
    title: initialTemplate?.name ?? "",
    notes: "",
    athleteIds: [],
  });
  const [titleTouched, setTitleTouched] = useState(false);
  const [errors, setErrors] = useState<FieldErrors<keyof ScheduleInput>>({});
  const [saving, setSaving] = useState(false);
  const toast = useToast();
  const template = templates.find((t) => t.id === values.templateId);

  function patch(changes: Partial<ScheduleInput>) {
    setValues((prev) => ({ ...prev, ...changes }));
  }

  function chooseTemplate(id: string) {
    const t = templates.find((x) => x.id === id);
    // El título sigue a la plantilla mientras el coach no lo haya cambiado.
    patch({ templateId: id, ...(!titleTouched && t ? { title: t.name } : {}) });
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    const found = validateSchedule(values, { today, maxDate });
    setErrors(found);
    if (hasErrors(found)) {
      toast.show({ tone: "error", title: "Revisa los campos marcados" });
      return;
    }
    setSaving(true);
    // Si se programa, la acción redirige al detalle de la sesión.
    const result = await scheduleSessionAction(values);
    setSaving(false);
    if (result.errors) setErrors(result.errors);
    toast.show({ tone: "error", title: "No se programó la sesión", description: result.message ?? "Revisa los campos marcados." });
  }

  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-4">
      <FormSection id="plantilla" title="Plantilla" description="Solo plantillas publicadas. Se congela al programar: cambios posteriores no afectan esta sesión.">
        <Select label="Plantilla publicada" value={values.templateId} onChange={(e) => chooseTemplate(e.target.value)} error={errors.templateId}>
          <option value="">Elige una plantilla</option>
          {templates.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </Select>
        {template && (
          <p className="text-sm text-muted">
            {template.estimatedMinutes ? formatDuration(template.estimatedMinutes) : "Sin duración"} · Intensidad {INTENSITY_LABEL[template.intensity].toLowerCase()}
          </p>
        )}
      </FormSection>

      <FormSection id="cuando" title="Fecha y hora">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Input label="Fecha" type="date" min={today} max={maxDate} value={values.date} onChange={(e) => patch({ date: e.target.value })} error={errors.date} />
          <Input
            label="Hora de inicio"
            optional
            type="time"
            value={values.time}
            onChange={(e) => patch({ time: e.target.value })}
            error={errors.time}
            hint="Déjala vacía si el atleta entrena cuando pueda."
          />
        </div>
      </FormSection>

      <FormSection id="detalle" title="Título y notas">
        <Input
          label="Título"
          value={values.title}
          onChange={(e) => {
            setTitleTouched(true);
            patch({ title: e.target.value });
          }}
          error={errors.title}
          maxLength={80}
          autoComplete="off"
        />
        <Textarea
          label="Notas para los atletas"
          optional
          rows={3}
          value={values.notes}
          onChange={(e) => patch({ notes: e.target.value })}
          error={errors.notes}
          hint="Por ejemplo: llega 10 minutos antes para calentar."
          maxLength={500}
        />
      </FormSection>

      <FormSection id="atletas" title="Atletas" description="Solo atletas activos de tu equipo.">
        {athletes.length === 0 ? (
          <div className="flex flex-col gap-3">
            <p className="text-sm text-muted">No tienes atletas activos. Invita a un atleta o reactiva a uno en pausa.</p>
            <ButtonLink href="/coach/atletas" variant="secondary" className="self-start">
              Ir a Atletas
            </ButtonLink>
          </div>
        ) : (
          <AthleteMultiSelect athletes={athletes} value={values.athleteIds} onChange={(ids) => patch({ athleteIds: ids })} error={errors.athleteIds} />
        )}
      </FormSection>

      <StickyActions>
        <div className="hidden sm:mr-auto sm:block">
          <ButtonLink href="/coach/calendario" variant="ghost">
            Cancelar
          </ButtonLink>
        </div>
        <Button type="submit" size="lg" loading={saving} loadingLabel="Programando…" icon={<CalendarCheck aria-hidden className="size-5" />} fullWidth className="sm:w-auto">
          Programar sesión
        </Button>
      </StickyActions>
    </form>
  );
}
