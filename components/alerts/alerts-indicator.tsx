import Link from "next/link";
import { Bell } from "lucide-react";
import { requireCoach } from "@/lib/auth/session";
import { countUnreadAlerts, syncCoachAlerts } from "@/lib/db/alerts";
import { cn } from "@/lib/utils/cn";
import { logWarn } from "@/lib/log";

/** Texto accesible del indicador. */
const labelFor = (n: number) => (n === 0 ? "Avisos, sin avisos pendientes" : `Avisos, ${n} sin leer`);
const shortCount = (n: number) => (n > 99 ? "99+" : String(n));

/** Contador del layout: si falla, el enlace se muestra sin número (nunca rompe el panel). */
async function unreadCount(): Promise<number | null> {
  const coach = await requireCoach();
  try {
    await syncCoachAlerts(coach.id);
    return await countUnreadAlerts(coach.id);
  } catch (error) {
    logWarn("alertsIndicator", error);
    return null;
  }
}

/** Barra superior en mobile: campana con contador. */
export async function AlertsBellMobile() {
  const n = await unreadCount();
  return <AlertsBell count={n} />;
}

export function AlertsBell({ count }: { count: number | null }) {
  return (
    <Link
      href="/coach/avisos"
      aria-label={count === null ? "Avisos" : labelFor(count)}
      className="relative inline-flex size-11 items-center justify-center rounded-xl text-muted hover:bg-surface-2 hover:text-ink"
    >
      <Bell aria-hidden className="size-5" />
      {count !== null && count > 0 && (
        <span aria-hidden className="absolute top-1 right-1 min-w-5 rounded-full bg-acid px-1 text-center text-xs leading-5 font-bold text-on-acid tabular-nums">
          {shortCount(count)}
        </span>
      )}
    </Link>
  );
}

/** Barra lateral (tablet y desktop): enlace "Avisos" con contador. */
export async function AlertsLinkDesktop() {
  const n = await unreadCount();
  return <AlertsLink count={n} />;
}

export function AlertsLink({ count }: { count: number | null }) {
  return (
    <Link
      href="/coach/avisos"
      aria-label={count === null ? "Avisos" : labelFor(count)}
      className="flex min-h-11 items-center gap-3 rounded-xl px-3 text-sm text-muted transition-colors hover:bg-surface-2/60 hover:text-ink"
    >
      <Bell aria-hidden className="size-5" />
      <span className="flex-1">Avisos</span>
      {count !== null && count > 0 && (
        <span aria-hidden className={cn("min-w-6 rounded-full bg-acid px-1.5 text-center text-xs leading-6 font-bold text-on-acid tabular-nums")}>
          {shortCount(count)}
        </span>
      )}
    </Link>
  );
}
