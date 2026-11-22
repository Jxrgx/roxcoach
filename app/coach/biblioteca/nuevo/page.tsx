import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { requireCoach } from "@/lib/auth/session";
import { listSubstitutionCandidates } from "@/lib/db/exercises";
import { PageHeader } from "@/components/shared/page-header";
import { EMPTY_EXERCISE, ExerciseForm } from "@/components/coach/exercise-form";

export const metadata: Metadata = { title: "Nuevo ejercicio" };

export default async function NewExercisePage() {
  const coach = await requireCoach();
  const options = await listSubstitutionCandidates(coach.id);
  return (
    <div className="mx-auto max-w-3xl">
      <Link href="/coach/biblioteca" className="-ml-2 mb-3 inline-flex min-h-11 items-center gap-1.5 rounded-xl px-2 text-sm text-muted hover:text-ink">
        <ArrowLeft aria-hidden className="size-4" />
        Biblioteca
      </Link>
      <PageHeader title="Nuevo ejercicio" description="Solo tú lo verás en tu biblioteca y podrás usarlo en tus plantillas." />
      <ExerciseForm initial={EMPTY_EXERCISE} substitutionOptions={options} cancelHref="/coach/biblioteca" />
    </div>
  );
}
