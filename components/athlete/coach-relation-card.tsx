import { PauseCircle, UserRound } from "lucide-react";
import type { AthleteCoachDTO } from "@/lib/db/athletes";
import { Avatar } from "@/components/shared/avatar";
import { Badge } from "@/components/ui/badge";

/** Coach actual del atleta, o cómo conseguir uno. */
export function CoachRelationCard({ coach }: { coach: AthleteCoachDTO | null }) {
  if (!coach) {
    return (
      <section aria-labelledby="mi-coach" className="rounded-2xl border border-dashed border-line p-4">
        <h2 id="mi-coach" className="flex items-center gap-2 font-semibold text-ink">
          <UserRound aria-hidden className="size-5 text-muted" />
          Aún no tienes coach
        </h2>
        <p className="mt-1 text-sm text-muted">Pídele a tu coach un enlace de invitación para unirte a su equipo.</p>
      </section>
    );
  }
  const paused = coach.status === "paused";
  return (
    <section aria-labelledby="mi-coach" className="rounded-2xl border border-line bg-surface p-4">
      <h2 id="mi-coach" className="text-sm font-medium text-muted">
        Tu coach
      </h2>
      <div className="mt-2 flex items-center gap-3">
        <Avatar name={coach.coachName} />
        <div className="min-w-0 flex-1">
          <p className="font-semibold text-ink">{coach.coachName}</p>
          {coach.gymName && <p className="truncate text-sm text-muted">{coach.gymName}</p>}
        </div>
        <Badge tone={paused ? "neutral" : "positive"}>{paused ? "En pausa" : "Activo"}</Badge>
      </div>
      {paused && (
        <p className="mt-3 flex items-start gap-2 text-sm text-muted">
          <PauseCircle aria-hidden className="mt-0.5 size-4 shrink-0 text-warning" />
          Tu coach pausó tu plan por ahora. Te avisará cuando lo reactive.
        </p>
      )}
    </section>
  );
}
