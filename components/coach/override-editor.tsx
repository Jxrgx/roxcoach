"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Eye, RotateCcw, Save, UserCog } from "lucide-react";
import { saveOverridesAction } from "@/app/coach/sesiones/actions";
import {
  applyOverrides,
  describeChanges,
  effectiveToPreview,
  formItemFor,
  validateOverrideForm,
  type OverrideFieldErrors,
  type OverrideFormItem,
  type ReplacementOption,
} from "@/lib/overrides/apply";
import { CATEGORY_LABEL } from "@/lib/exercises/rules";
import type { SessionSnapshotV1, SnapshotExercise } from "@/lib/scheduling/snapshot";
import { formatSetTarget, type WeightUnit } from "@/lib/workouts/rules";
import { formatClock } from "@/lib/utils/format";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Disclosure } from "@/components/ui/disclosure";
import { Input, Select, Textarea } from "@/components/ui/field";
import { Modal } from "@/components/ui/modal";
import { useToast } from "@/components/ui/toast";
import { StickyActions } from "@/components/shared/sticky-actions";
import { TemplatePreview } from "@/components/workouts/template-preview";

interface Props {
  sessionId: string;
  athleteId: string;
  athleteName: string;
  title: string;
  snapshot: SessionSnapshotV1;
  initial: OverrideFormItem[];
  unit: WeightUnit;
  options: ReplacementOption[];
  suggested: Record<string, string[]>;
  backHref: string;
}

const keyOf = (it: { blockIndex: number; exerciseIndex: number }) => `${it.blockIndex}.${it.exerciseIndex}`;
const TARGET_LABEL = { reps: "Repeticiones", distance: "Distancia (m)", time: "Tiempo (mm:ss)" } as const;

function originalSummary(ex: SnapshotExercise, unit: WeightUnit) {
  return `${ex.sets} × ${formatSetTarget(ex, unit)}${ex.restSeconds ? ` · descanso ${formatClock(ex.restSeconds)}` : ""}`;
}

/**
 * Editor de la personalización de UN atleta. Organizado por ejercicio
 * (acordeones), con el plan original a la vista, resumen de cambios antes de
 * guardar y "Guardar personalización" como acción principal.
 */
export function OverrideEditor({ sessionId, athleteId, athleteName, title, snapshot, initial, unit, options, suggested, backHref }: Props) {
  const router = useRouter();
  const toast = useToast();
  const [items, setItems] = useState(initial);
  const [errors, setErrors] = useState<OverrideFieldErrors>({});
  const [dirty, setDirty] = useState(false);
  const [preview, setPreview] = useState(false);
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const [confirmRestoreAll, setConfirmRestoreAll] = useState(false);
  const [pending, startTransition] = useTransition();
  const optionMap = useMemo(() => new Map(options.map((o) => [o.id, o])), [options]);

  // Aviso del navegador al salir con cambios sin guardar.
  useEffect(() => {
    if (!dirty || pending) return;
    const handler = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [dirty, pending]);

  const validated = useMemo(() => validateOverrideForm(items, snapshot, unit, optionMap), [items, snapshot, unit, optionMap]);
  const plan = useMemo(() => (validated.ok ? applyOverrides(snapshot, validated.rows) : null), [validated, snapshot]);
  const changes = plan
    ? plan.blocks.flatMap((b, bi) => b.exercises.map((e, ei) => ({ key: `${bi}.${ei}`, original: e.original.name, changes: describeChanges(e, unit) }))).filter((c) => c.changes.length > 0)
    : [];

  function patch(key: string, values: Partial<OverrideFormItem>) {
    setItems((prev) => prev.map((it) => (keyOf(it) === key ? { ...it, ...values } : it)));
    setDirty(true);
  }

  function restore(key: string, ex: SnapshotExercise, bi: number, ei: number) {
    patch(key, formItemFor(ex, bi, ei, null, unit));
  }

  function save(list: OverrideFormItem[], successTitle: string) {
    startTransition(async () => {
      const result = await saveOverridesAction(sessionId, athleteId, list);
      if (!result.ok) {
        setErrors(result.errors ?? {});
        toast.show({ tone: "error", title: "No se guardó la personalización", description: result.message });
        return;
      }
      setErrors({});
      setDirty(false);
      toast.show({ tone: "success", title: successTitle });
      router.push(backHref);
    });
  }

  function submit() {
    if (!validated.ok) {
      setErrors(validated.errors);
      toast.show({ tone: "error", title: "Revisa los campos marcados" });
      return;
    }
    save(items, `Personalización guardada para ${athleteName}`);
  }

  const shownErrors = { ...(validated.ok ? {} : validated.errors), ...errors };
  const err = (key: string, field: string) => (dirty || Object.keys(errors).length ? shownErrors[`${key}.${field}`] : undefined);

  return (
    <div className="flex flex-col gap-5">
      {snapshot.blocks.map((b, bi) => (
        <section key={`${bi}-${b.name}`} aria-labelledby={`bloque-${bi}`} className="flex flex-col gap-2">
          <h2 id={`bloque-${bi}`} className="text-base font-semibold text-ink">
            Bloque {bi + 1} · {b.name}
          </h2>
          <ol className="flex flex-col gap-2">
            {b.exercises.map((ex, ei) => {
              const key = `${bi}.${ei}`;
              const it = items.find((x) => keyOf(x) === key)!;
              const eff = plan?.blocks[bi]?.exercises[ei];
              const suggestedIds = (suggested[ex.exerciseId] ?? []).filter((id) => optionMap.has(id));
              const byCategory = new Map<string, ReplacementOption[]>();
              for (const o of options) if (o.id !== ex.exerciseId && !suggestedIds.includes(o.id)) byCategory.set(o.category, [...(byCategory.get(o.category) ?? []), o]);
              return (
                <li key={key}>
                  <Disclosure
                    defaultOpen={eff?.adapted ?? false}
                    title={
                      <span className="flex flex-wrap items-center gap-2">
                        <span className="break-words">{eff?.replaced ? eff.name : ex.name}</span>
                        {eff?.skipped ? (
                          <Badge tone="warning">Ejercicio omitido</Badge>
                        ) : eff?.adapted ? (
                          <Badge tone="info" icon={<UserCog aria-hidden />}>
                            Ajustado
                          </Badge>
                        ) : null}
                      </span>
                    }
                    meta={`Plan original: ${originalSummary(ex, unit)}`}
                  >
                    <div className="flex flex-col gap-4">
                      <div className="rounded-xl border border-dashed border-line px-3.5 py-2.5">
                        <p className="text-sm font-medium text-muted">Plan original</p>
                        <p className="mt-0.5 font-semibold text-ink">{ex.name}</p>
                        <p className="text-sm tabular-nums text-ink">{originalSummary(ex, unit)}</p>
                      </div>

                      <fieldset className="flex flex-col gap-3">
                        <legend className="mb-1 text-sm font-semibold text-ink">Ajuste para este atleta</legend>
                        <label className="flex min-h-11 items-center gap-3 rounded-xl border border-line px-3 text-sm text-ink">
                          <input type="checkbox" className="size-5 accent-acid" checked={it.skipped} onChange={(e) => patch(key, { skipped: e.target.checked })} />
                          Omitir este ejercicio para {athleteName}
                        </label>

                        {!it.skipped && (
                          <>
                            <Select label="Ejercicio" value={it.replacementId} onChange={(e) => patch(key, { replacementId: e.target.value })} error={err(key, "replacementId")}>
                              <option value="">{ex.name} (original)</option>
                              {suggestedIds.length > 0 && (
                                <optgroup label="Sustituciones sugeridas">
                                  {suggestedIds.map((id) => (
                                    <option key={id} value={id}>
                                      {optionMap.get(id)!.name}
                                    </option>
                                  ))}
                                </optgroup>
                              )}
                              {[...byCategory.entries()].map(([cat, list]) => (
                                <optgroup key={cat} label={CATEGORY_LABEL[cat as keyof typeof CATEGORY_LABEL] ?? cat}>
                                  {list.map((o) => (
                                    <option key={o.id} value={o.id}>
                                      {o.name}
                                    </option>
                                  ))}
                                </optgroup>
                              ))}
                            </Select>
                            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                              <Input label="Series" inputMode="numeric" value={it.sets} onChange={(e) => patch(key, { sets: e.target.value })} error={err(key, "sets")} />
                              <Input
                                label={TARGET_LABEL[ex.targetType]}
                                inputMode={ex.targetType === "time" ? "text" : "numeric"}
                                value={it.target}
                                onChange={(e) => patch(key, { target: e.target.value })}
                                error={err(key, "target")}
                              />
                              <Input
                                label={`Carga (${unit})`}
                                optional
                                inputMode="decimal"
                                value={it.removeLoad ? "" : it.load}
                                disabled={it.removeLoad}
                                onChange={(e) => patch(key, { load: e.target.value })}
                                error={err(key, "load")}
                              />
                              <Input label="Descanso (mm:ss)" optional value={it.rest} onChange={(e) => patch(key, { rest: e.target.value })} error={err(key, "rest")} />
                            </div>
                            {ex.loadKg !== null && (
                              <label className="flex min-h-11 items-center gap-3 rounded-xl border border-line px-3 text-sm text-ink">
                                <input type="checkbox" className="size-5 accent-acid" checked={it.removeLoad} onChange={(e) => patch(key, { removeLoad: e.target.checked })} />
                                Sin carga para este atleta
                              </label>
                            )}
                          </>
                        )}
                        <Textarea
                          label={it.replacementId ? "Motivo o nota para el atleta" : "Nota para el atleta"}
                          optional
                          rows={2}
                          maxLength={140}
                          value={it.note}
                          onChange={(e) => patch(key, { note: e.target.value })}
                          error={err(key, "note")}
                        />
                      </fieldset>
                      <Button variant="ghost" className="self-start" icon={<RotateCcw aria-hidden className="size-4" />} onClick={() => restore(key, ex, bi, ei)}>
                        Restaurar original
                      </Button>
                    </div>
                  </Disclosure>
                </li>
              );
            })}
          </ol>
        </section>
      ))}

      <section aria-labelledby="resumen-cambios" className="rounded-2xl border border-line bg-surface p-4">
        <h2 id="resumen-cambios" className="text-base font-semibold text-ink">
          Resumen de cambios
        </h2>
        {!validated.ok ? (
          <p role="alert" className="mt-2 text-sm text-danger">
            Corrige los campos marcados para ver el resumen.
          </p>
        ) : changes.length === 0 ? (
          <p className="mt-2 text-sm text-muted">Sin ajustes: {athleteName} verá el plan original.</p>
        ) : (
          <ul className="mt-2 flex flex-col gap-3">
            {changes.map((c) => (
              <li key={c.key} className="text-sm">
                <p className="font-medium text-ink">{c.original}</p>
                <ul className="mt-1 flex flex-col gap-0.5">
                  {c.changes.map((ch) => (
                    <li key={ch.label} className="text-muted">
                      {ch.label}: <span className="tabular-nums">{ch.from}</span> → <span className="font-medium text-ink tabular-nums">{ch.to}</span>
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Acciones secundarias (no fijas): la única acción fija es guardar. */}
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
        <Button variant="secondary" icon={<Eye aria-hidden className="size-4" />} onClick={() => setPreview(true)} disabled={!plan}>
          Vista previa
        </Button>
        <Button variant="secondary" icon={<RotateCcw aria-hidden className="size-4" />} onClick={() => setConfirmRestoreAll(true)} disabled={pending}>
          Restaurar todo
        </Button>
        <Button variant="ghost" onClick={() => (dirty ? setConfirmDiscard(true) : router.push(backHref))} disabled={pending}>
          Cancelar
        </Button>
      </div>

      <StickyActions>
        <Button size="lg" fullWidth className="sm:w-auto" icon={<Save aria-hidden className="size-5" />} loading={pending} loadingLabel="Guardando…" onClick={submit}>
          Guardar personalización
        </Button>
      </StickyActions>

      <Modal open={preview} onClose={() => setPreview(false)} title={`Así lo verá ${athleteName}`} description="Vista previa de su versión personalizada.">
        {plan && <TemplatePreview data={effectiveToPreview(plan, title, unit)} />}
      </Modal>

      <ConfirmDialog
        open={confirmDiscard}
        onClose={() => setConfirmDiscard(false)}
        onConfirm={() => {
          setDirty(false);
          router.push(backHref);
        }}
        title="¿Descartar los cambios?"
        description="Los ajustes que no guardaste se perderán."
        confirmLabel="Sí, descartar"
        cancelLabel="Seguir editando"
      />
      <ConfirmDialog
        open={confirmRestoreAll}
        onClose={() => setConfirmRestoreAll(false)}
        onConfirm={() => {
          setConfirmRestoreAll(false);
          save([], `${athleteName} vuelve al plan original`);
        }}
        loading={pending}
        tone="default"
        title="¿Restaurar el plan original?"
        description={`Se quitan todos los ajustes de ${athleteName}. La plantilla y la sesión no cambian.`}
        confirmLabel="Sí, restaurar todo"
        cancelLabel="Volver"
      />
    </div>
  );
}
