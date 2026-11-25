import type { Metadata } from "next";
import { cache, Suspense } from "react";
import { MessagesSquare, Users } from "lucide-react";
import { requireCoach } from "@/lib/auth/session";
import { listCoachConversations, loadThread } from "@/lib/db/messages";
import { todayKey } from "@/lib/scheduling/dates";
import { APP_TIME_ZONE } from "@/lib/utils/format";
import { isUuid } from "@/lib/messages/actions-shared";
import { PageHeader } from "@/components/shared/page-header";
import { ContentSkeleton, InlineSkeleton } from "@/components/shared/page-skeletons";
import { StateMessage } from "@/components/ui/state-message";
import { ButtonLink } from "@/components/ui/button";
import { ConversationList, CoachThreadHeader } from "@/components/coach/conversations";
import { MessageThread } from "@/components/messages/message-thread";
import { markCoachThreadReadAction, sendCoachMessageAction } from "@/app/coach/mensajes/actions";
import { cn } from "@/lib/utils/cn";

export const metadata: Metadata = { title: "Mensajes" };

/**
 * Mensajes uno a uno con los atletas (fase 16). `?atleta=<id>` abre una
 * conversación: en mobile se ve una vista a la vez (lista o conversación); desde
 * desktop, ambas lado a lado. Sin tiempo real: se actualiza al enviar, al volver
 * a la pestaña y cada 30 s.
 */
type Query = PageProps<"/coach/mensajes">["searchParams"];

const conversations = cache(async () => listCoachConversations((await requireCoach()).id));

export default function MessagesPage({ searchParams }: PageProps<"/coach/mensajes">) {
  return (
    <>
      <Suspense fallback={<PageHeader title="Mensajes" description={<InlineSkeleton />} />}>
        <MessagesHeader />
      </Suspense>
      <Suspense fallback={<ContentSkeleton label="Cargando mensajes…" />}>
        <MessagesContent searchParams={searchParams} />
      </Suspense>
    </>
  );
}

async function MessagesHeader() {
  const unread = (await conversations()).reduce((n, c) => n + c.unread, 0);
  return (
    <PageHeader
      title="Mensajes"
      description={unread === 0 ? "Estás al día con tus atletas." : `${unread} ${unread === 1 ? "mensaje sin leer" : "mensajes sin leer"}.`}
    />
  );
}

async function MessagesContent({ searchParams }: { searchParams: Query }) {
  const [list, query, coach] = await Promise.all([conversations(), searchParams, requireCoach()]);
  const param = typeof query.atleta === "string" ? query.atleta : null;
  const selectedId = param && isUuid(param) ? param : null;

  if (list.length === 0 && !param) {
    return (
      <StateMessage
        icon={<Users />}
        title="Todavía no tienes atletas"
        description="Cuando un atleta acepte tu invitación, podrás escribirle desde aquí."
        action={
          <ButtonLink href="/coach/atletas" variant="secondary">
            Invitar atletas
          </ButtonLink>
        }
      />
    );
  }

  const thread = selectedId ? await loadThread({ role: "coach", id: coach.id }, selectedId) : null;
  const today = todayKey(APP_TIME_ZONE);

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,20rem)_minmax(0,1fr)]">
      <div className={cn(param && "hidden lg:block")}>
        <ConversationList conversations={list} selectedId={selectedId} today={today} />
      </div>

      <div className={cn(!param && "hidden lg:block")}>
        {thread ? (
          <MessageThread
            key={thread.athleteId}
            thread={thread}
            viewer="coach"
            today={today}
            onSend={sendCoachMessageAction.bind(null, thread.athleteId)}
            onMarkRead={markCoachThreadReadAction.bind(null, thread.athleteId)}
            header={<CoachThreadHeader name={thread.counterpartName} status={thread.status} />}
          />
        ) : param ? (
          <StateMessage
            icon={<MessagesSquare />}
            title="Esta conversación no está disponible"
            description="El atleta no existe o no forma parte de tu equipo."
            action={
              <ButtonLink href="/coach/mensajes" variant="secondary">
                Ver conversaciones
              </ButtonLink>
            }
          />
        ) : (
          <StateMessage icon={<MessagesSquare />} title="Elige una conversación" description="Selecciona un atleta para ver sus mensajes o escribirle." />
        )}
      </div>
    </div>
  );
}
