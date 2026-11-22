import { Play, VideoOff } from "lucide-react";
import type { Exercise, ExerciseCategory } from "@/lib/types/domain";
import { formatClock } from "@/lib/utils/format";
import { Badge } from "@/components/ui/badge";

export const CATEGORY_LABEL: Record<ExerciseCategory, string> = {
  carrera: "Carrera",
  estaciones: "Estaciones HYROX",
  fuerza: "Fuerza",
  movilidad: "Movilidad",
};

/** Ejercicio de la biblioteca con representación visual del video. */
export function ExerciseCard({ exercise }: { exercise: Exercise }) {
  const hasVideo = exercise.videoDurationSeconds !== undefined;
  return (
    <article className="overflow-hidden rounded-2xl border border-line bg-surface shadow-card">
      <div
        role="img"
        aria-label={hasVideo ? `Video de demostración de ${exercise.name}` : `${exercise.name} sin video`}
        className="relative flex aspect-video items-center justify-center bg-surface-2"
        style={{
          backgroundImage:
            "repeating-linear-gradient(135deg, transparent 0 14px, rgb(255 255 255 / 0.025) 14px 28px)",
        }}
      >
        {hasVideo ? (
          <>
            <span className="flex size-12 items-center justify-center rounded-full border border-line bg-bg/80">
              <Play aria-hidden className="ml-0.5 size-5 text-ink" />
            </span>
            <span className="absolute right-2.5 bottom-2.5 rounded-md bg-bg/85 px-1.5 py-0.5 text-xs font-medium tabular-nums text-ink">
              {formatClock(exercise.videoDurationSeconds ?? 0)}
            </span>
          </>
        ) : (
          <span className="flex items-center gap-1.5 text-sm text-muted">
            <VideoOff aria-hidden className="size-4" />
            Sin video
          </span>
        )}
      </div>
      <div className="p-4">
        <div className="flex items-start justify-between gap-2">
          <h3 className="font-semibold leading-snug text-ink">{exercise.name}</h3>
          <Badge>{CATEGORY_LABEL[exercise.category]}</Badge>
        </div>
        <p className="mt-1.5 text-sm text-muted">{exercise.cue}</p>
        {exercise.equipment.length > 0 && (
          <p className="mt-2 text-sm text-ink">
            <span className="text-muted">Equipo: </span>
            {exercise.equipment.join(", ")}
          </p>
        )}
      </div>
    </article>
  );
}
