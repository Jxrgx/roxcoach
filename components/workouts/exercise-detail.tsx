import Link from "next/link";
import type { ReactNode } from "react";
import { Archive, ArrowRightLeft, BadgeCheck, ChevronRight, Dumbbell, Lightbulb } from "lucide-react";
import type { ExerciseDetailDTO } from "@/lib/db/exercises";
import { CATEGORY_LABEL, DIFFICULTY_LABEL } from "@/lib/exercises/rules";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { ExerciseMedia } from "@/components/workouts/exercise-media";

interface ExerciseDetailProps {
  exercise: ExerciseDetailDTO;
  /** Enlace al detalle de una sustitución dentro del área actual (coach o atleta). */
  substituteHref: (id: string) => string;
  /** Acciones de la pantalla (solo coach). */
  actions?: ReactNode;
  /** Aviso superior (p. ej. "Ejercicio guardado"). */
  notice?: ReactNode;
  backLink: ReactNode;
}

/**
 * Vista detallada de un ejercicio, compartida por coach y atleta.
 * Jerarquía: medio e indicación clave primero; instrucciones completas;
 * equipo y sustituciones después.
 */
export function ExerciseDetail({ exercise, substituteHref, actions, notice, backLink }: ExerciseDetailProps) {
  return (
    <article className="mx-auto max-w-3xl">
      {backLink}
      {notice}

      <header className="mb-5 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <div className="mb-2 flex flex-wrap gap-1.5">
            <Badge>{CATEGORY_LABEL[exercise.category]}</Badge>
            <Badge tone="info">{DIFFICULTY_LABEL[exercise.difficulty]}</Badge>
            {exercise.origin === "system" ? (
              <Badge icon={<BadgeCheck aria-hidden />}>RoxCoach</Badge>
            ) : (
              <Badge tone="positive">Personalizado</Badge>
            )}
            {exercise.archived && (
              <Badge tone="warning" icon={<Archive aria-hidden />}>
                Archivado
              </Badge>
            )}
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-ink sm:text-3xl">{exercise.name}</h1>
        </div>
        {actions && <div className="flex shrink-0 flex-col gap-2 sm:flex-row">{actions}</div>}
      </header>

      <ExerciseMedia name={exercise.name} mediaType={exercise.mediaType} mediaUrl={exercise.mediaUrl} variant="full" className="rounded-2xl border border-line" />

      {exercise.cue && (
        <p className="mt-4 flex items-start gap-2.5 rounded-2xl border border-line bg-surface p-4 text-ink">
          <Lightbulb aria-hidden className="mt-0.5 size-5 shrink-0 text-acid" />
          <span>
            <span className="sr-only">Indicación clave: </span>
            <strong className="font-semibold">{exercise.cue}</strong>
          </span>
        </p>
      )}

      <Card className="mt-4">
        <h2 className="text-base font-semibold text-ink">Cómo se ejecuta</h2>
        <p className="mt-2 whitespace-pre-line text-ink">{exercise.instructions}</p>
      </Card>

      <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
        <Card>
          <h2 className="flex items-center gap-2 text-base font-semibold text-ink">
            <Dumbbell aria-hidden className="size-5 text-muted" />
            Equipo requerido
          </h2>
          {exercise.equipment.length === 0 ? (
            <p className="mt-2 text-sm text-muted">No necesita equipo.</p>
          ) : (
            <ul className="mt-3 flex flex-wrap gap-2">
              {exercise.equipment.map((item) => (
                <li key={item} className="rounded-full border border-line bg-surface-2 px-3 py-1.5 text-sm text-ink">
                  {item}
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card>
          <h2 className="flex items-center gap-2 text-base font-semibold text-ink">
            <ArrowRightLeft aria-hidden className="size-5 text-muted" />
            Sustituciones
          </h2>
          {exercise.substitutes.length === 0 ? (
            <p className="mt-2 text-sm text-muted">Sin sustituciones definidas.</p>
          ) : (
            <ol className="mt-2 flex flex-col">
              {exercise.substitutes.map((s, i) => (
                <li key={s.id}>
                  <Link
                    href={substituteHref(s.id)}
                    className="flex min-h-11 items-center gap-2 rounded-xl px-2 text-ink hover:bg-surface-2"
                  >
                    <span className="text-sm tabular-nums text-muted">{i + 1}.</span>
                    <span className="min-w-0 flex-1 truncate">{s.name}</span>
                    {s.archived && <Badge tone="warning">Archivado</Badge>}
                    <ChevronRight aria-hidden className="size-4 shrink-0 text-muted" />
                  </Link>
                </li>
              ))}
            </ol>
          )}
        </Card>
      </div>
    </article>
  );
}
