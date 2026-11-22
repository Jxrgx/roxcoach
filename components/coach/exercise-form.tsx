"use client";

import { useState, type FormEvent } from "react";
import { createExerciseAction, updateExerciseAction } from "@/app/coach/biblioteca/actions";
import { CATEGORY_LABEL, DIFFICULTY_LABEL, EXERCISE_CATEGORIES, EXERCISE_DIFFICULTIES, mediaHost } from "@/lib/exercises/rules";
import { EQUIPMENT_OPTIONS, hasErrors, validateExercise, type ExerciseInput, type FieldErrors } from "@/lib/validations";
import { Input, Select, Textarea } from "@/components/ui/field";
import { Button, ButtonLink } from "@/components/ui/button";
import { FormSection, ToggleChip } from "@/components/ui/form-controls";
import { useToast } from "@/components/ui/toast";
import { StickyActions } from "@/components/shared/sticky-actions";
import { SubstitutionPicker, type SubstitutionOption } from "@/components/coach/substitution-picker";

export const EMPTY_EXERCISE: ExerciseInput = {
  name: "",
  category: "",
  difficulty: "",
  instructions: "",
  cue: "",
  equipment: [],
  mediaType: "",
  mediaUrl: "",
  substituteIds: [],
};

interface ExerciseFormProps {
  /** Sin id = crear; con id = editar ese ejercicio propio. */
  exerciseId?: string;
  initial: ExerciseInput;
  substitutionOptions: SubstitutionOption[];
  cancelHref: string;
}

/**
 * Crear o editar un ejercicio propio. Formulario en secciones cortas; valida
 * en cliente y de nuevo en servidor; no borra lo capturado si hay error.
 */
export function ExerciseForm({ exerciseId, initial, substitutionOptions, cancelHref }: ExerciseFormProps) {
  const [values, setValues] = useState<ExerciseInput>(initial);
  const [errors, setErrors] = useState<FieldErrors<keyof ExerciseInput>>({});
  const [saving, setSaving] = useState(false);
  const toast = useToast();

  function patch(changes: Partial<ExerciseInput>) {
    setValues((prev) => ({ ...prev, ...changes }));
  }

  function toggleEquipment(item: string) {
    patch({ equipment: values.equipment.includes(item) ? values.equipment.filter((e) => e !== item) : [...values.equipment, item] });
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    const found = validateExercise(values);
    setErrors(found);
    if (hasErrors(found)) {
      toast.show({ tone: "error", title: "Revisa los campos marcados" });
      return;
    }
    setSaving(true);
    // Si se guarda, la acción redirige al detalle y no regresa.
    const result = exerciseId ? await updateExerciseAction(exerciseId, values) : await createExerciseAction(values);
    setSaving(false);
    if (!result.ok) {
      if (result.errors) setErrors(result.errors);
      toast.show({ tone: "error", title: "No se guardó el ejercicio", description: result.message ?? "Revisa los campos marcados." });
    }
  }

  const host = values.mediaUrl ? mediaHost(values.mediaUrl.trim()) : null;

  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-4">
      <FormSection id="basicos" title="Datos básicos">
        <Input label="Nombre" value={values.name} onChange={(e) => patch({ name: e.target.value })} error={errors.name} autoComplete="off" maxLength={80} />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Select label="Categoría" value={values.category} onChange={(e) => patch({ category: e.target.value })} error={errors.category}>
            <option value="">Elige una categoría</option>
            {EXERCISE_CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {CATEGORY_LABEL[c]}
              </option>
            ))}
          </Select>
          <Select label="Dificultad" value={values.difficulty} onChange={(e) => patch({ difficulty: e.target.value })} error={errors.difficulty}>
            <option value="">Elige una dificultad</option>
            {EXERCISE_DIFFICULTIES.map((d) => (
              <option key={d} value={d}>
                {DIFFICULTY_LABEL[d]}
              </option>
            ))}
          </Select>
        </div>
      </FormSection>

      <FormSection id="ejecucion" title="Ejecución" description="Lo que el atleta necesita para hacerlo bien.">
        <Textarea
          label="Instrucciones"
          rows={5}
          value={values.instructions}
          onChange={(e) => patch({ instructions: e.target.value })}
          error={errors.instructions}
          hint="Paso a paso, en lenguaje claro."
          maxLength={2000}
        />
        <Input
          label="Indicación clave"
          optional
          value={values.cue}
          onChange={(e) => patch({ cue: e.target.value })}
          error={errors.cue}
          hint="Una frase corta para recordar durante el esfuerzo."
          maxLength={140}
        />
      </FormSection>

      <FormSection id="equipo" title="Equipo requerido" description="Déjalo vacío si no necesita equipo.">
        <fieldset>
          <legend className="sr-only">Equipo requerido</legend>
          <div className="flex flex-wrap gap-2">
            {EQUIPMENT_OPTIONS.map((item) => (
              <ToggleChip key={item} label={item} checked={values.equipment.includes(item)} onChange={() => toggleEquipment(item)} />
            ))}
          </div>
          {errors.equipment && <p role="alert" className="mt-1.5 text-sm text-danger">{errors.equipment}</p>}
        </fieldset>
      </FormSection>

      <FormSection id="medio" title="Video o imagen" description="Pega un enlace https. Los videos se abren en otra pestaña.">
        <Select
          label="Tipo de medio"
          value={values.mediaType}
          onChange={(e) => patch({ mediaType: e.target.value, ...(e.target.value === "" ? { mediaUrl: "" } : {}) })}
          error={errors.mediaType}
        >
          <option value="">Sin video ni imagen</option>
          <option value="video">Video</option>
          <option value="imagen">Imagen</option>
        </Select>
        {values.mediaType !== "" && (
          <Input
            label="Enlace"
            type="url"
            inputMode="url"
            placeholder="https://"
            value={values.mediaUrl}
            onChange={(e) => patch({ mediaUrl: e.target.value })}
            error={errors.mediaUrl}
            hint={host ? `Se abrirá desde ${host}.` : "Por ejemplo, un video de YouTube o una imagen pública."}
            autoComplete="off"
            maxLength={500}
          />
        )}
      </FormSection>

      <FormSection id="sustituciones" title="Sustituciones" description="Alternativas en orden de preferencia, por si falta equipo o hay molestias.">
        <SubstitutionPicker
          options={substitutionOptions}
          value={values.substituteIds}
          onChange={(ids) => patch({ substituteIds: ids })}
          excludeId={exerciseId}
          error={errors.substituteIds}
        />
      </FormSection>

      <StickyActions>
        {/* En mobile basta la acción principal (volver está arriba): la barra fija ocupa menos pantalla. */}
        <div className="hidden sm:block">
          <ButtonLink href={cancelHref} variant="ghost">
            Cancelar
          </ButtonLink>
        </div>
        <Button type="submit" size="lg" loading={saving} fullWidth className="sm:w-auto">
          {exerciseId ? "Guardar cambios" : "Crear ejercicio"}
        </Button>
      </StickyActions>
    </form>
  );
}
