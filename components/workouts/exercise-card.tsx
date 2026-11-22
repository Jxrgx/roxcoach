import Link from "next/link";
import { Archive, BadgeCheck } from "lucide-react";
import {
  CATEGORY_LABEL,
  DIFFICULTY_LABEL,
  type ExerciseCategoryValue,
  type ExerciseDifficultyValue,
  type ExerciseOrigin,
  type MediaTypeValue,
} from "@/lib/exercises/rules";
import { cn } from "@/lib/utils/cn";
import { Badge } from "@/components/ui/badge";
import { ExerciseMedia } from "@/components/workouts/exercise-media";

export { CATEGORY_LABEL };

export interface ExerciseCardData {
  name: string;
  category: ExerciseCategoryValue;
  difficulty?: ExerciseDifficultyValue;
  equipment: string[];
  cue: string;
  mediaType: MediaTypeValue | null;
  mediaUrl: string | null;
  origin?: ExerciseOrigin;
  archived?: boolean;
}

/** Ejercicio de la biblioteca: medio visual, categoría, dificultad, origen y equipo. */
export function ExerciseCard({ exercise, href }: { exercise: ExerciseCardData; href?: string }) {
  const body = (
    <>
      <ExerciseMedia name={exercise.name} mediaType={exercise.mediaType} mediaUrl={exercise.mediaUrl} />
      <div className="p-4">
        <h3 className="font-semibold leading-snug text-ink">{exercise.name}</h3>
        <div className="mt-2 flex flex-wrap gap-1.5">
          <Badge>{CATEGORY_LABEL[exercise.category]}</Badge>
          {exercise.difficulty && <Badge tone="info">{DIFFICULTY_LABEL[exercise.difficulty]}</Badge>}
          {exercise.origin === "system" && (
            <Badge tone="neutral" icon={<BadgeCheck aria-hidden />}>
              RoxCoach
            </Badge>
          )}
          {exercise.origin === "own" && <Badge tone="positive">Personalizado</Badge>}
          {exercise.archived && (
            <Badge tone="warning" icon={<Archive aria-hidden />}>
              Archivado
            </Badge>
          )}
        </div>
        {exercise.cue && <p className="mt-2 text-sm text-muted">{exercise.cue}</p>}
        <p className="mt-2 text-sm text-ink">
          <span className="text-muted">Equipo: </span>
          {exercise.equipment.length > 0 ? exercise.equipment.join(", ") : "Sin equipo"}
        </p>
      </div>
    </>
  );

  const base = "block h-full overflow-hidden rounded-2xl border border-line bg-surface shadow-card";
  if (href) {
    return (
      <Link href={href} className={cn(base, "transition-colors hover:border-muted/50")}>
        {body}
      </Link>
    );
  }
  return <article className={base}>{body}</article>;
}
