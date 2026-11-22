import Link from "next/link";
import { requireCoach } from "@/lib/auth/session";
import { Avatar } from "@/components/shared/avatar";
import { Skeleton } from "@/components/ui/loading-state";

/** Tarjeta del coach en la barra lateral (servidor, datos reales). */
export async function CoachProfileCard() {
  const coach = await requireCoach();
  return (
    <Link
      href="/coach/configuracion"
      className="flex items-center gap-3 rounded-xl border border-line bg-surface p-3 hover:border-muted/50"
    >
      <Avatar name={coach.name} size="sm" />
      <span className="min-w-0">
        <span className="block truncate text-sm font-semibold text-ink">{coach.name}</span>
        <span className="block truncate text-xs text-muted">{coach.gymName || "Configura tu gimnasio"}</span>
      </span>
    </Link>
  );
}

export function CoachProfileCardSkeleton() {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-line bg-surface p-3" aria-hidden>
      <Skeleton className="size-9 rounded-full" />
      <div className="flex-1">
        <Skeleton className="h-3.5 w-24" />
        <Skeleton className="mt-1.5 h-3 w-16" />
      </div>
    </div>
  );
}

/** Avatar del coach en la barra superior móvil. */
export async function CoachMobileProfile() {
  const coach = await requireCoach();
  return (
    <Link
      href="/coach/configuracion"
      aria-label={`Perfil de ${coach.name} y configuración`}
      className="flex size-11 items-center justify-center rounded-full"
    >
      <Avatar name={coach.name} size="sm" />
    </Link>
  );
}

export function CoachMobileProfileSkeleton() {
  return <Skeleton className="size-9 rounded-full" />;
}
