import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { requireCoach } from "@/lib/auth/session";
import { builderExerciseOptions } from "@/lib/workouts/builder-data";
import { newKey } from "@/lib/workouts/convert";
import { PageHeader } from "@/components/shared/page-header";
import { TemplateBuilder } from "@/components/coach/template-builder";

export const metadata: Metadata = { title: "Nueva plantilla" };

export default async function NewTemplatePage() {
  const coach = await requireCoach();
  const options = await builderExerciseOptions(coach.id);
  return (
    <div className="mx-auto max-w-3xl">
      <Link href="/coach/entrenamientos" className="-ml-2 mb-3 inline-flex min-h-11 items-center gap-1.5 rounded-xl px-2 text-sm text-muted hover:text-ink">
        <ArrowLeft aria-hidden className="size-4" />
        Entrenamientos
      </Link>
      <PageHeader title="Nueva plantilla" description="Arma la sesión por bloques con ejercicios de tu biblioteca. Puedes guardarla como borrador y publicarla después." />
      <TemplateBuilder
        initial={{
          name: "",
          focus: "",
          intensity: "media",
          estimatedMinutes: "",
          blocks: [{ key: newKey("b"), name: "Bloque 1", notes: "", exercises: [] }],
        }}
        weightUnit={coach.weightUnit}
        options={options}
        archivedInfo={{}}
        cancelHref="/coach/entrenamientos"
      />
    </div>
  );
}
