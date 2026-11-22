import type { Metadata } from "next";
import { Plus } from "lucide-react";
import { requireCoach } from "@/lib/auth/session";
import { listTemplates } from "@/lib/db/templates";
import { PageHeader } from "@/components/shared/page-header";
import { ScreenStates } from "@/components/shared/screen-states";
import { ButtonLink } from "@/components/ui/button";
import { TemplateList } from "@/components/coach/template-list";

export const metadata: Metadata = { title: "Entrenamientos" };

function CreateTemplate() {
  return (
    <ButtonLink href="/coach/entrenamientos/nueva" icon={<Plus aria-hidden className="size-5" />} fullWidth className="sm:w-auto">
      Crear plantilla
    </ButtonLink>
  );
}

export default async function WorkoutsPage() {
  const coach = await requireCoach();
  const templates = await listTemplates(coach.id);
  const published = templates.filter((t) => t.status === "publicada").length;

  return (
    <>
      <PageHeader
        title="Entrenamientos"
        description={
          templates.length === 0
            ? "Tus plantillas reutilizables, armadas con ejercicios de tu biblioteca."
            : `${published} ${published === 1 ? "plantilla publicada" : "plantillas publicadas"} lista${published === 1 ? "" : "s"} para programar.`
        }
        action={<CreateTemplate />}
      />
      <ScreenStates
        empty={{
          title: "Todavía no tienes plantillas",
          description: "Crea tu primera plantilla para programar más rápido.",
          action: <CreateTemplate />,
        }}
        loadingLabel="Cargando plantillas…"
        loadingVariant="cards"
      >
        <TemplateList templates={templates} />
      </ScreenStates>
    </>
  );
}
