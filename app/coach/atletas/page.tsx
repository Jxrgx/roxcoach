import type { Metadata } from "next";
import { UserPlus } from "lucide-react";
import { mockAthletes } from "@/lib/mock/coach";
import { PageHeader } from "@/components/shared/page-header";
import { ScreenStates } from "@/components/shared/screen-states";
import { ComingSoonButton } from "@/components/shared/coming-soon-button";
import { AthleteList } from "@/components/coach/athlete-list";

export const metadata: Metadata = { title: "Atletas" };

function AddAthlete() {
  return (
    <ComingSoonButton
      icon={<UserPlus aria-hidden className="size-5" />}
      module="atletas"
      description="Podrás invitar atletas por correo y asignarles su división HYROX."
      fullWidth
      className="sm:w-auto"
    >
      Agregar atleta
    </ComingSoonButton>
  );
}

export default function AthletesPage() {
  return (
    <>
      <PageHeader
        title="Atletas"
        description={`${mockAthletes.length} atletas en tu equipo. Revisa quién va al día y quién necesita atención.`}
        action={<AddAthlete />}
      />
      <ScreenStates
        empty={{
          title: "Todavía no tienes atletas registrados",
          description: "Agrega a tu primer atleta para empezar a asignarle sesiones.",
          action: <AddAthlete />,
        }}
        loadingLabel="Cargando atletas…"
        loadingVariant="cards"
      >
        <AthleteList athletes={mockAthletes} />
      </ScreenStates>
    </>
  );
}
