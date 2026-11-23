import type { Metadata } from "next";
import { cache, Suspense } from "react";
import { Plus } from "lucide-react";
import { requireCoach } from "@/lib/auth/session";
import { listTemplates } from "@/lib/db/templates";
import { PageHeader } from "@/components/shared/page-header";
import { ScreenStates } from "@/components/shared/screen-states";
import { ContentSkeleton, InlineSkeleton } from "@/components/shared/page-skeletons";
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

/** Plantillas del coach, una vez por petición (las comparten el resumen y la lista). */
const loadTemplates = cache(async () => {
  const coach = await requireCoach();
  return listTemplates(coach.id);
});

/** La estructura (título y acción) aparece al instante; el resumen y la lista llegan con los datos. */
export default function WorkoutsPage() {
  return (
    <>
      <PageHeader
        title="Entrenamientos"
        description={
          <Suspense fallback={<InlineSkeleton />}>
            <TemplatesSummary />
          </Suspense>
        }
        action={<CreateTemplate />}
      />
      <Suspense fallback={<ContentSkeleton label="Cargando plantillas…" variant="cards" />}>
        <TemplatesContent />
      </Suspense>
    </>
  );
}

async function TemplatesSummary() {
  const templates = await loadTemplates();
  const published = templates.filter((t) => t.status === "publicada").length;
  return (
    <>
      {templates.length === 0
        ? "Tus plantillas reutilizables, armadas con ejercicios de tu biblioteca."
        : `${published} ${published === 1 ? "plantilla publicada" : "plantillas publicadas"} lista${published === 1 ? "" : "s"} para programar.`}
    </>
  );
}

async function TemplatesContent() {
  const templates = await loadTemplates();
  return (
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
  );
}
