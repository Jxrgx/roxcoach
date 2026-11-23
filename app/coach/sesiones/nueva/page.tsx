import type { Metadata } from "next";
import { Suspense } from "react";
import Link from "next/link";
import { ArrowLeft, ClipboardList } from "lucide-react";
import { requireCoach } from "@/lib/auth/session";
import { listAssignableAthletes, listSchedulableTemplates } from "@/lib/db/sessions";
import { addDaysKey, todayKey } from "@/lib/scheduling/dates";
import { APP_TIME_ZONE } from "@/lib/utils/format";
import { PageHeader } from "@/components/shared/page-header";
import { StateMessage } from "@/components/ui/state-message";
import { ButtonLink } from "@/components/ui/button";
import { ScheduleForm } from "@/components/coach/schedule-form";
import { ContentSkeleton } from "@/components/shared/page-skeletons";

export const metadata: Metadata = { title: "Nueva sesión" };

export default function NewSessionPage({ searchParams }: PageProps<"/coach/sesiones/nueva">) {
  return (
    <div className="mx-auto max-w-3xl">
      <Link href="/coach/calendario" className="-ml-2 mb-3 inline-flex min-h-11 items-center gap-1.5 rounded-xl px-2 text-sm text-muted hover:text-ink">
        <ArrowLeft aria-hidden className="size-4" />
        Calendario
      </Link>
      <PageHeader title="Nueva sesión" description="Programa una plantilla publicada para uno o varios atletas." />
      <Suspense fallback={<ContentSkeleton label="Cargando plantillas y atletas…" rows={4} />}>
        <NewSessionForm searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

async function NewSessionForm({ searchParams }: { searchParams: PageProps<"/coach/sesiones/nueva">["searchParams"] }) {
  const [coach, query] = await Promise.all([requireCoach(), searchParams]);
  const [templates, athletes] = await Promise.all([listSchedulableTemplates(coach.id), listAssignableAthletes(coach.id)]);
  const today = todayKey(APP_TIME_ZONE);
  const preselected = typeof query.plantilla === "string" ? query.plantilla : "";

  return templates.length === 0 ? (
    <StateMessage
      icon={<ClipboardList />}
      title="Aún no tienes plantillas publicadas"
      description="Crea una plantilla y publícala para poder programarla."
      action={<ButtonLink href="/coach/entrenamientos">Ir a Entrenamientos</ButtonLink>}
    />
  ) : (
    <ScheduleForm templates={templates} athletes={athletes} initialTemplateId={preselected} today={today} maxDate={addDaysKey(today, 366)} />
  );
}
