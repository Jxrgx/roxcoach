"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import { AlertTriangle, ArrowDown, ArrowUp, Eye, Plus, Trash2 } from "lucide-react";
import { saveTemplateAction } from "@/app/coach/entrenamientos/actions";
import { defaultExerciseInput, inputToPreview, newKey, type ExerciseInfo } from "@/lib/workouts/convert";
import { MAX_BLOCKS, MAX_EXERCISES_PER_BLOCK, moveItem, TARGET_LABEL, TARGET_TYPES, type WeightUnit } from "@/lib/workouts/rules";
import { INTENSITY_LABEL } from "@/lib/utils/format";
import { CATEGORY_LABEL, type ExerciseCategoryValue } from "@/lib/exercises/rules";
import { validateTemplate, type BlockExerciseInput, type BlockInput, type TemplateErrors, type TemplateInput } from "@/lib/validations";
import { Input, Select, Textarea } from "@/components/ui/field";
import { Button, ButtonLink } from "@/components/ui/button";
import { IconButton } from "@/components/ui/icon-button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Modal } from "@/components/ui/modal";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { FormSection } from "@/components/ui/form-controls";
import { useToast } from "@/components/ui/toast";
import { StickyActions } from "@/components/shared/sticky-actions";
import { TemplatePreview } from "@/components/workouts/template-preview";
import { ExercisePickerSheet, type ExerciseOption } from "@/components/coach/exercise-picker-sheet";

interface TemplateBuilderProps {
  /** Sin id = nueva plantilla. */
  templateId?: string;
  initial: TemplateInput;
  weightUnit: WeightUnit;
  /** Ejercicios elegibles (sistema + propios, no archivados). */
  options: ExerciseOption[];
  /** Nombres de ejercicios ya usados que ya no son elegibles (archivados). */
  archivedInfo: Record<string, { name: string; category: string }>;
  cancelHref: string;
}

function newBlock(index: number): BlockInput {
  return { key: newKey("b"), name: `Bloque ${index + 1}`, notes: "", exercises: [] };
}

/**
 * Constructor de plantillas: datos → bloques → ejercicios con su prescripción.
 * Reordenar con botones subir/bajar (accesibles, cómodos en mobile).
 * Vista previa antes de guardar; guardar reemplaza la plantilla completa.
 */
export function TemplateBuilder({ templateId, initial, weightUnit, options, archivedInfo, cancelHref }: TemplateBuilderProps) {
  const [values, setValues] = useState<TemplateInput>(initial);
  const [errors, setErrors] = useState<TemplateErrors>({});
  const [serverProblems, setServerProblems] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [pickerBlock, setPickerBlock] = useState<number | null>(null);
  const [confirmRemoveBlock, setConfirmRemoveBlock] = useState<number | null>(null);
  const [preview, setPreview] = useState(false);
  const toast = useToast();

  const info = useMemo(() => {
    const map = new Map<string, ExerciseInfo>();
    for (const o of options) map.set(o.id, { name: o.name, category: o.category, archived: false });
    for (const [id, a] of Object.entries(archivedInfo)) map.set(id, { name: a.name, category: a.category, archived: true });
    return map;
  }, [options, archivedInfo]);

  // Aviso al salir con cambios sin guardar.
  useEffect(() => {
    if (!dirty || saving) return;
    const handler = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [dirty, saving]);

  function update(next: TemplateInput) {
    setValues(next);
    setDirty(true);
  }
  const patch = (changes: Partial<TemplateInput>) => update({ ...values, ...changes });
  const setBlocks = (blocks: BlockInput[]) => update({ ...values, blocks });
  const patchBlock = (b: number, changes: Partial<BlockInput>) =>
    setBlocks(values.blocks.map((block, i) => (i === b ? { ...block, ...changes } : block)));
  const patchExercise = (b: number, e: number, changes: Partial<BlockExerciseInput>) =>
    patchBlock(b, { exercises: values.blocks[b]!.exercises.map((ex, i) => (i === e ? { ...ex, ...changes } : ex)) });

  function addExercise(option: ExerciseOption) {
    if (pickerBlock === null) return;
    const block = values.blocks[pickerBlock]!;
    patchBlock(pickerBlock, { exercises: [...block.exercises, defaultExerciseInput(option.id, option.category)] });
    toast.show({ tone: "success", title: `${option.name} agregado`, description: `En “${block.name || `Bloque ${pickerBlock + 1}`}”.` });
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    const found = validateTemplate(values, { publish: false, weightUnit });
    setErrors(found);
    setServerProblems([]);
    if (Object.keys(found).length) {
      toast.show({ tone: "error", title: "Revisa los campos marcados", description: `${Object.keys(found).length} por corregir.` });
      return;
    }
    setSaving(true);
    // Si se guarda, la acción redirige al detalle y no regresa.
    const result = await saveTemplateAction(templateId ?? null, values);
    setSaving(false);
    if (result.errors) setErrors(result.errors);
    if (result.problems) setServerProblems(result.problems);
    toast.show({ tone: "error", title: "No se guardó la plantilla", description: result.message ?? "Revisa los campos marcados." });
  }

  const err = (path: string) => errors[path];
  const errorCount = Object.keys(errors).length;

  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-4">
      {(errorCount > 0 || serverProblems.length > 0) && (
        <div role="alert" className="flex gap-2.5 rounded-2xl border border-danger/40 bg-danger/10 p-4 text-sm text-ink">
          <AlertTriangle aria-hidden className="mt-0.5 size-5 shrink-0 text-danger" />
          <div>
            <p className="font-semibold">{errorCount > 0 ? `Hay ${errorCount} ${errorCount === 1 ? "campo" : "campos"} por corregir.` : "No se pudo guardar."}</p>
            {serverProblems.length > 0 && (
              <ul className="mt-1 list-disc pl-5 text-muted">
                {serverProblems.map((p) => (
                  <li key={p}>{p}</li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}

      <FormSection id="datos" title="Datos de la plantilla">
        <Input label="Nombre" value={values.name} onChange={(e) => patch({ name: e.target.value })} error={err("name")} autoComplete="off" maxLength={80} />
        <Input
          label="Enfoque"
          optional
          value={values.focus}
          onChange={(e) => patch({ focus: e.target.value })}
          error={err("focus")}
          hint="Por ejemplo: resistencia aeróbica y potencia en trineo."
          maxLength={140}
        />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Select label="Intensidad" value={values.intensity} onChange={(e) => patch({ intensity: e.target.value })} error={err("intensity")}>
            {(["baja", "media", "alta"] as const).map((i) => (
              <option key={i} value={i}>
                {INTENSITY_LABEL[i]}
              </option>
            ))}
          </Select>
          <Input
            label="Duración estimada (min)"
            inputMode="numeric"
            value={values.estimatedMinutes}
            onChange={(e) => patch({ estimatedMinutes: e.target.value })}
            error={err("estimatedMinutes")}
            hint="Requerida para publicar."
            autoComplete="off"
          />
        </div>
      </FormSection>

      <section aria-labelledby="bloques" className="flex flex-col gap-3">
        <div className="flex items-baseline justify-between gap-3">
          <h2 id="bloques" className="text-base font-semibold text-ink">
            Bloques <span className="font-normal text-muted">({values.blocks.length})</span>
          </h2>
        </div>
        {err("blocks") && (
          <p role="alert" className="text-sm text-danger">
            {err("blocks")}
          </p>
        )}

        {values.blocks.length === 0 && (
          <p className="rounded-2xl border border-dashed border-line p-4 text-sm text-muted">
            Agrega tu primer bloque (por ejemplo: calentamiento, carrera, estaciones, enfriamiento).
          </p>
        )}

        <ol className="flex flex-col gap-3">
          {values.blocks.map((block, b) => {
            const label = block.name.trim() || `Bloque ${b + 1}`;
            return (
              <li key={block.key}>
                <Card padding="sm" className="sm:p-5">
                  <fieldset aria-label={`Bloque ${b + 1}: ${label}`}>
                    <div className="flex items-center gap-1">
                      <span className="inline-flex size-8 shrink-0 items-center justify-center rounded-lg bg-surface-2 text-sm font-semibold tabular-nums text-muted">
                        {b + 1}
                      </span>
                      <span className="ml-1.5 min-w-0 flex-1 text-sm font-medium text-muted">Bloque</span>
                      <IconButton label={`Subir bloque ${label}`} icon={<ArrowUp />} disabled={b === 0} onClick={() => setBlocks(moveItem(values.blocks, b, -1))} />
                      <IconButton
                        label={`Bajar bloque ${label}`}
                        icon={<ArrowDown />}
                        disabled={b === values.blocks.length - 1}
                        onClick={() => setBlocks(moveItem(values.blocks, b, 1))}
                      />
                      <IconButton
                        label={`Quitar bloque ${label}`}
                        icon={<Trash2 />}
                        onClick={() => (block.exercises.length ? setConfirmRemoveBlock(b) : setBlocks(values.blocks.filter((_, i) => i !== b)))}
                      />
                    </div>

                    <div className="mt-3 flex flex-col gap-3">
                      <Input
                        label="Nombre del bloque"
                        value={block.name}
                        onChange={(e) => patchBlock(b, { name: e.target.value })}
                        error={err(`blocks.${b}.name`)}
                        maxLength={60}
                        autoComplete="off"
                      />
                      <Textarea
                        label="Notas del bloque"
                        optional
                        rows={2}
                        value={block.notes}
                        onChange={(e) => patchBlock(b, { notes: e.target.value })}
                        error={err(`blocks.${b}.notes`)}
                        maxLength={280}
                      />
                    </div>

                    <ol className="mt-4 flex flex-col divide-y divide-line border-t border-line">
                      {block.exercises.map((ex, e) => {
                        const exInfo = info.get(ex.exerciseId);
                        const name = exInfo?.name ?? "Ejercicio no disponible";
                        const ep = `blocks.${b}.exercises.${e}`;
                        return (
                          <li key={ex.key} className="py-4">
                            <fieldset aria-label={`${name} (bloque ${b + 1}, ejercicio ${e + 1})`}>
                              <div className="flex items-start gap-1">
                                <div className="min-w-0 flex-1 pt-2">
                                  <p className="font-semibold text-ink">
                                    <span className="mr-1.5 tabular-nums text-muted">{e + 1}.</span>
                                    {name}
                                  </p>
                                  <p className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-muted">
                                    {exInfo && CATEGORY_LABEL[exInfo.category as ExerciseCategoryValue]}
                                    {exInfo?.archived && <Badge tone="warning">Archivado: considera cambiarlo</Badge>}
                                  </p>
                                  {err(`${ep}.exerciseId`) && <p role="alert" className="mt-1 text-sm text-danger">{err(`${ep}.exerciseId`)}</p>}
                                </div>
                                <IconButton
                                  label={`Subir ${name}`}
                                  icon={<ArrowUp />}
                                  disabled={e === 0}
                                  onClick={() => patchBlock(b, { exercises: moveItem(block.exercises, e, -1) })}
                                />
                                <IconButton
                                  label={`Bajar ${name}`}
                                  icon={<ArrowDown />}
                                  disabled={e === block.exercises.length - 1}
                                  onClick={() => patchBlock(b, { exercises: moveItem(block.exercises, e, 1) })}
                                />
                                <IconButton
                                  label={`Quitar ${name}`}
                                  icon={<Trash2 />}
                                  onClick={() => patchBlock(b, { exercises: block.exercises.filter((_, i) => i !== e) })}
                                />
                              </div>

                              <div className="mt-3 grid grid-cols-2 gap-3 md:grid-cols-4">
                                <div className="col-span-2 md:col-span-1">
                                  <Select
                                    label="Objetivo"
                                    value={ex.targetType}
                                    onChange={(v) => patchExercise(b, e, { targetType: v.target.value, target: "" })}
                                    error={err(`${ep}.targetType`)}
                                  >
                                    {TARGET_TYPES.map((t) => (
                                      <option key={t} value={t}>
                                        {t === "reps" ? "Repeticiones" : t === "distance" ? "Distancia" : "Tiempo"}
                                      </option>
                                    ))}
                                  </Select>
                                </div>
                                <Input
                                  label="Series"
                                  inputMode="numeric"
                                  value={ex.sets}
                                  onChange={(v) => patchExercise(b, e, { sets: v.target.value })}
                                  error={err(`${ep}.sets`)}
                                  autoComplete="off"
                                />
                                <Input
                                  label={TARGET_LABEL[ex.targetType as keyof typeof TARGET_LABEL] ?? "Valor"}
                                  inputMode={ex.targetType === "time" ? "text" : "numeric"}
                                  placeholder={ex.targetType === "time" ? "1:30" : undefined}
                                  value={ex.target}
                                  onChange={(v) => patchExercise(b, e, { target: v.target.value })}
                                  error={err(`${ep}.target`)}
                                  autoComplete="off"
                                />
                                <Input
                                  label={`Carga (${weightUnit})`}
                                  optional
                                  inputMode="decimal"
                                  value={ex.load}
                                  onChange={(v) => patchExercise(b, e, { load: v.target.value })}
                                  error={err(`${ep}.load`)}
                                  autoComplete="off"
                                />
                                <Input
                                  label="Descanso"
                                  optional
                                  placeholder="1:30"
                                  value={ex.rest}
                                  onChange={(v) => patchExercise(b, e, { rest: v.target.value })}
                                  error={err(`${ep}.rest`)}
                                  hint="Segundos o mm:ss."
                                  autoComplete="off"
                                />
                                <div className="col-span-2 md:col-span-3">
                                  <Input
                                    label="Nota"
                                    optional
                                    value={ex.notes}
                                    onChange={(v) => patchExercise(b, e, { notes: v.target.value })}
                                    error={err(`${ep}.notes`)}
                                    maxLength={140}
                                    autoComplete="off"
                                  />
                                </div>
                              </div>
                            </fieldset>
                          </li>
                        );
                      })}
                    </ol>

                    {err(`blocks.${b}.exercises`) && (
                      <p role="alert" className="mt-2 text-sm text-danger">
                        {err(`blocks.${b}.exercises`)}
                      </p>
                    )}
                    <Button
                      variant="secondary"
                      className="mt-3"
                      fullWidth
                      icon={<Plus aria-hidden className="size-4" />}
                      onClick={() => setPickerBlock(b)}
                      disabled={block.exercises.length >= MAX_EXERCISES_PER_BLOCK}
                      aria-label={`Agregar ejercicio a ${label}`}
                    >
                      Agregar ejercicio
                    </Button>
                  </fieldset>
                </Card>
              </li>
            );
          })}
        </ol>

        <Button
          variant="secondary"
          icon={<Plus aria-hidden className="size-4" />}
          onClick={() => setBlocks([...values.blocks, newBlock(values.blocks.length)])}
          disabled={values.blocks.length >= MAX_BLOCKS}
        >
          Agregar bloque
        </Button>
      </section>

      <StickyActions>
        <div className="hidden sm:mr-auto sm:block">
          <ButtonLink href={cancelHref} variant="ghost">
            Cancelar
          </ButtonLink>
        </div>
        <div className="grid grid-cols-[auto_1fr] gap-2 sm:flex">
          <Button variant="secondary" onClick={() => setPreview(true)} icon={<Eye aria-hidden className="size-5" />} aria-haspopup="dialog">
            Vista previa
          </Button>
          <Button type="submit" size="lg" loading={saving} className="min-w-0 px-4 whitespace-nowrap">
            {templateId ? "Guardar cambios" : "Guardar plantilla"}
          </Button>
        </div>
      </StickyActions>

      <ExercisePickerSheet
        open={pickerBlock !== null}
        onClose={() => setPickerBlock(null)}
        onPick={addExercise}
        options={options}
        blockName={pickerBlock !== null ? values.blocks[pickerBlock]?.name || `Bloque ${pickerBlock + 1}` : ""}
      />

      <Modal
        open={preview}
        onClose={() => setPreview(false)}
        title="Vista previa"
        description="Así verá el atleta esta sesión."
        footer={
          <Button variant="secondary" onClick={() => setPreview(false)} fullWidth className="sm:w-auto">
            Seguir editando
          </Button>
        }
      >
        {preview && <TemplatePreview data={inputToPreview(values, weightUnit, info)} />}
      </Modal>

      <ConfirmDialog
        open={confirmRemoveBlock !== null}
        onClose={() => setConfirmRemoveBlock(null)}
        onConfirm={() => {
          if (confirmRemoveBlock !== null) setBlocks(values.blocks.filter((_, i) => i !== confirmRemoveBlock));
          setConfirmRemoveBlock(null);
        }}
        title="¿Quitar este bloque?"
        description="Se quitarán también sus ejercicios de la plantilla. El cambio se aplica al guardar."
        confirmLabel="Sí, quitar bloque"
        cancelLabel="Volver"
      />
    </form>
  );
}
