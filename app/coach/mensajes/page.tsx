import type { Metadata } from "next";
import { SquarePen } from "lucide-react";
import { mockConversations } from "@/lib/mock/coach";
import { PageHeader } from "@/components/shared/page-header";
import { ScreenStates } from "@/components/shared/screen-states";
import { ComingSoonButton } from "@/components/shared/coming-soon-button";
import { Conversations } from "@/components/coach/conversations";

export const metadata: Metadata = { title: "Mensajes" };

function NewMessage() {
  return (
    <ComingSoonButton
      icon={<SquarePen aria-hidden className="size-5" />}
      module="mensajes"
      description="Podrás iniciar conversaciones con uno o varios atletas y comentar sesiones específicas."
      variant="secondary"
      fullWidth
      className="sm:w-auto"
    >
      Nuevo mensaje
    </ComingSoonButton>
  );
}

export default function MessagesPage() {
  const unread = mockConversations.reduce((n, c) => n + c.unread, 0);
  return (
    <>
      <PageHeader
        title="Mensajes"
        description={unread > 0 ? `Tienes ${unread} mensajes sin leer.` : "Estás al día con tus atletas."}
        action={<NewMessage />}
      />
      <ScreenStates
        empty={{
          title: "No tienes conversaciones",
          description: "Cuando tus atletas comenten una sesión o te escriban, aparecerá aquí.",
        }}
        loadingLabel="Cargando mensajes…"
      >
        <Conversations conversations={mockConversations} />
      </ScreenStates>
    </>
  );
}
