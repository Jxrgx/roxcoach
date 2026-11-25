import type { Metadata } from "next";
import { Suspense } from "react";
import { UserRound } from "lucide-react";
import { requireAthlete } from "@/lib/auth/session";
import { loadThread } from "@/lib/db/messages";
import { todayKey } from "@/lib/scheduling/dates";
import { APP_TIME_ZONE } from "@/lib/utils/format";
import { PageHeader } from "@/components/shared/page-header";
import { ContentSkeleton } from "@/components/shared/page-skeletons";
import { StateMessage } from "@/components/ui/state-message";
import { MessageThread } from "@/components/messages/message-thread";
import { markAthleteThreadReadAction, sendAthleteMessageAction } from "@/app/atleta/mensajes/actions";

export const metadata: Metadata = { title: "Mensajes" };

/**
 * Conversación del atleta con su coach (fase 16). El coach se resuelve en el
 * servidor: el atleta no elige con quién escribe ni ve conversaciones ajenas.
 */
export default function AthleteMessagesPage() {
  return (
    <>
      <PageHeader title="Mensajes" description="Habla con tu coach sobre tu entrenamiento." />
      <Suspense fallback={<ContentSkeleton label="Cargando mensajes…" />}>
        <AthleteThread />
      </Suspense>
    </>
  );
}

async function AthleteThread() {
  const athlete = await requireAthlete();
  const thread = await loadThread({ role: "athlete", id: athlete.id }, null);
  if (!thread) {
    return (
      <StateMessage
        icon={<UserRound />}
        title="Aún no tienes coach"
        description="Cuando aceptes la invitación de un coach, podrás escribirle desde aquí."
      />
    );
  }
  return (
    <MessageThread
      thread={thread}
      viewer="athlete"
      today={todayKey(APP_TIME_ZONE)}
      onSend={sendAthleteMessageAction}
      onMarkRead={markAthleteThreadReadAction}
      header={
        <header className="border-b border-line px-4 py-3">
          <h2 className="font-semibold text-ink">{thread.counterpartName}</h2>
          <p className="text-sm text-muted">Tu coach</p>
        </header>
      }
    />
  );
}
