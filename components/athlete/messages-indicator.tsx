import Link from "next/link";
import { MessageSquare } from "lucide-react";
import { requireAthlete } from "@/lib/auth/session";
import { countUnreadForAthlete } from "@/lib/db/messages";
import { logWarn } from "@/lib/log";

const shortCount = (n: number) => (n > 99 ? "99+" : String(n));

/** Enlace "Mensajes" del encabezado del atleta (texto + icono, con no leídos). */
export function MessagesHeaderLink({ count }: { count: number | null }) {
  return (
    <Link
      href="/atleta/mensajes"
      aria-label={count ? `Mensajes, ${count} sin leer` : "Mensajes"}
      className="relative inline-flex min-h-11 items-center gap-1.5 rounded-xl px-3 text-sm text-muted hover:bg-surface-2 hover:text-ink"
    >
      <MessageSquare aria-hidden className="size-5" />
      <span>Mensajes</span>
      {count !== null && count > 0 && (
        <span aria-hidden className="min-w-5 rounded-full bg-acid px-1 text-center text-xs leading-5 font-bold text-on-acid tabular-nums">
          {shortCount(count)}
        </span>
      )}
    </Link>
  );
}

/** Con el contador real; si falla, el enlace se muestra sin número (nunca rompe el área). */
export async function AthleteMessagesHeaderLink() {
  const athlete = await requireAthlete();
  let count: number | null = null;
  try {
    count = await countUnreadForAthlete(athlete.id);
  } catch (error) {
    logWarn("athleteMessagesIndicator", error);
  }
  return <MessagesHeaderLink count={count} />;
}
