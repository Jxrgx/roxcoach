import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Lock, UserCog } from "lucide-react";
import { requireCoach } from "@/lib/auth/session";
import { findAssignmentForOverride, listReplacementOptions } from "@/lib/db/overrides";
import { applyOverrides, describeChanges, formItemFor, LOCK_MESSAGE } from "@/lib/overrides/apply";
import { formatKeyLong } from "@/lib/scheduling/dates";
import { ScreenStates } from "@/components/shared/screen-states";
import { OverrideEditor } from "@/components/coach/override-editor";

export const metadata: Metadata = { title: "Personalizar sesión" };

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Personalización de UNA asignación (fase 10). Solo el coach dueño de la
 * sesión y con relación activa; bloqueada si el atleta ya comenzó, la sesión
 * se canceló o el atleta fue retirado. La plantilla y el snapshot no cambian.
 */
export default async function PersonalizePage({ params }: PageProps<"/coach/sesiones/[id]/atletas/[athleteId]/personalizar">) {
  const [{ id, athleteId }, coach] = await Promise.all([params, requireCoach()]);
  const target = UUID_RE.test(id) && UUID_RE.test(athleteId) ? await findAssignmentForOverride(coach.id, id, athleteId) : null;
  if (!target) notFound();

  const backHref = `/coach/sesiones/${id}`;
  const plan = applyOverrides(target.snapshot, target.overrides);

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-4">
      <Link href={backHref} className="-ml-2 inline-flex min-h-11 items-center gap-1.5 self-start rounded-xl px-2 text-sm text-muted hover:text-ink">
        <ArrowLeft aria-hidden className="size-4" />
        {target.title}
      </Link>
      <header>
        <p className="text-sm font-medium text-muted">{formatKeyLong(target.date)}</p>
        <h1 className="mt-1 flex flex-wrap items-center gap-2 text-2xl font-bold tracking-tight text-ink sm:text-3xl">
          <UserCog aria-hidden className="size-6 text-electric" />
          Personalizar para {target.athleteName}
        </h1>
        <p className="mt-1 text-sm text-muted">Los ajustes son solo para este atleta. La plantilla y la sesión de los demás no cambian.</p>
        {target.lastEdit && (
          <p className="mt-1 text-sm text-muted">
            Último cambio: {target.lastEdit.at.toLocaleString("es-MX", { timeZone: "America/Mexico_City", dateStyle: "medium", timeStyle: "short" })}
            {target.lastEdit.by ? ` · ${target.lastEdit.by}` : ""}
          </p>
        )}
      </header>

      <ScreenStates
        empty={{ title: "Esta sesión no tiene ejercicios", description: "No hay nada que personalizar." }}
        loadingLabel="Cargando personalización…"
      >
        {target.lock !== "editable" ? (
          <div className="flex flex-col gap-4">
            <p role="status" className="flex items-start gap-2.5 rounded-2xl border border-warning/40 bg-warning/10 p-4 text-sm text-ink">
              <Lock aria-hidden className="mt-0.5 size-4 shrink-0 text-warning" />
              {LOCK_MESSAGE[target.lock]}
            </p>
            <section aria-labelledby="ajustes-actuales" className="rounded-2xl border border-line bg-surface p-4">
              <h2 id="ajustes-actuales" className="text-base font-semibold text-ink">
                Ajustes para este atleta
              </h2>
              {!plan.personalized ? (
                <p className="mt-2 text-sm text-muted">Sin ajustes: usa el plan original.</p>
              ) : (
                <ul className="mt-2 flex flex-col gap-3">
                  {plan.blocks.flatMap((b, bi) =>
                    b.exercises
                      .map((e, ei) => ({ e, key: `${bi}.${ei}` }))
                      .filter(({ e }) => e.adapted)
                      .map(({ e, key }) => (
                        <li key={key} className="text-sm">
                          <p className="font-medium text-ink">{e.original.name}</p>
                          <ul className="mt-1 flex flex-col gap-0.5 text-muted">
                            {describeChanges(e, coach.weightUnit).map((c) => (
                              <li key={c.label}>
                                {c.label}: {c.from} → <span className="font-medium text-ink">{c.to}</span>
                              </li>
                            ))}
                          </ul>
                        </li>
                      )),
                  )}
                </ul>
              )}
            </section>
          </div>
        ) : target.snapshot.blocks.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-line p-4 text-sm text-muted">Esta sesión no tiene ejercicios para personalizar.</p>
        ) : (
          <EditorLoader coachId={coach.id} target={target} unit={coach.weightUnit} backHref={backHref} />
        )}
      </ScreenStates>
    </div>
  );
}

async function EditorLoader({
  coachId,
  target,
  unit,
  backHref,
}: {
  coachId: string;
  target: NonNullable<Awaited<ReturnType<typeof findAssignmentForOverride>>>;
  unit: "kg" | "lb";
  backHref: string;
}) {
  const originalIds = target.snapshot.blocks.flatMap((b) => b.exercises.map((e) => e.exerciseId));
  const { options, suggested } = await listReplacementOptions(coachId, originalIds);
  const rows = new Map(target.overrides.map((o) => [`${o.blockIndex}.${o.exerciseIndex}`, o]));
  const initial = target.snapshot.blocks.flatMap((b, bi) => b.exercises.map((ex, ei) => formItemFor(ex, bi, ei, rows.get(`${bi}.${ei}`) ?? null, unit)));
  return (
    <OverrideEditor
      sessionId={target.sessionId}
      athleteId={target.athleteId}
      athleteName={target.athleteName}
      title={target.title}
      snapshot={target.snapshot}
      initial={initial}
      unit={unit}
      options={options}
      suggested={suggested}
      backHref={backHref}
    />
  );
}
