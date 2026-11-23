import type { Metadata } from "next";
import { cache, Suspense } from "react";
import { BellOff } from "lucide-react";
import { requireCoach } from "@/lib/auth/session";
import { countUnreadAlerts, listCoachAlerts, syncCoachAlerts } from "@/lib/db/alerts";
import { KIND_LABEL, parseKindFilter, parseReadFilter, READ_FILTER_LABEL } from "@/lib/alerts/rules";
import { PageHeader } from "@/components/shared/page-header";
import { ScreenStates } from "@/components/shared/screen-states";
import { StateMessage } from "@/components/ui/state-message";
import { ButtonLink } from "@/components/ui/button";
import { AlertItem } from "@/components/alerts/alert-item";
import { AlertFilters } from "@/components/alerts/alert-filters";
import { MarkAllReadButton } from "@/components/alerts/mark-read-button";
import { ContentSkeleton, InlineSkeleton } from "@/components/shared/page-skeletons";

export const metadata: Metadata = { title: "Avisos" };

/**
 * Bandeja de avisos del coach: situaciones reales que requieren atención,
 * ordenadas por prioridad (molestias → revisar → seguimiento → información) y fecha.
 * Acción principal: marcar todos como leídos (se conservan en "Leídos").
 */
type Query = PageProps<"/coach/avisos">["searchParams"];

/** Sincroniza (inserta y resuelve) una vez por petición; después el conteo y la lista van en paralelo. */
const syncedCoachId = cache(async () => {
  const coach = await requireCoach();
  await syncCoachAlerts(coach.id);
  return coach.id;
});

export default function CoachAlertsPage({ searchParams }: PageProps<"/coach/avisos">) {
  return (
    <>
      <Suspense fallback={<PageHeader title="Avisos" description={<InlineSkeleton />} />}>
        <AlertsHeader />
      </Suspense>
      <Suspense fallback={<ContentSkeleton label="Cargando avisos…" />}>
        <AlertsContent searchParams={searchParams} />
      </Suspense>
    </>
  );
}

/** La acción principal depende del número sin leer: el encabezado llega con ese dato (el título va en el fallback). */
async function AlertsHeader() {
  const unread = await countUnreadAlerts(await syncedCoachId());
  return (
    <PageHeader
      title="Avisos"
      description={
        unread === 0 ? "No tienes avisos pendientes." : `${unread} ${unread === 1 ? "aviso pendiente" : "avisos pendientes"} de tus atletas activos.`
      }
      action={<MarkAllReadButton count={unread} />}
    />
  );
}

async function AlertsContent({ searchParams }: { searchParams: Query }) {
  const [coachId, query] = await Promise.all([syncedCoachId(), searchParams]);
  const read = parseReadFilter(query.estado);
  const kind = parseKindFilter(query.tipo);
  const alerts = await listCoachAlerts(coachId, { read, kind });
  const filtered = read !== "sin-leer" || kind !== null;

  return (
    <ScreenStates
      empty={{ title: "No tienes avisos", description: "Aquí verás molestias, sesiones incompletas, RPE alto y sesiones no iniciadas de tus atletas." }}
      loadingLabel="Cargando avisos…"
    >
      <div className="flex flex-col gap-4">
        <AlertFilters read={read} kind={kind} />
        {alerts.length === 0 ? (
          <StateMessage
            icon={<BellOff />}
            title={filtered ? "Ningún aviso coincide con los filtros" : "Todo en orden"}
            description={
              filtered
                ? `Filtro: ${READ_FILTER_LABEL[read]}${kind ? ` · ${KIND_LABEL[kind]}` : ""}.`
                : "No hay avisos sin leer. Te avisaremos aquí cuando un atleta reporte una molestia, termine una sesión incompleta o con RPE alto, o no inicie una sesión."
            }
            action={
              filtered ? (
                <ButtonLink href="/coach/avisos" variant="secondary">
                  Ver avisos sin leer
                </ButtonLink>
              ) : (
                <ButtonLink href="/coach/avisos?estado=leidos" variant="secondary">
                  Ver avisos leídos
                </ButtonLink>
              )
            }
          />
        ) : (
          <ul className="grid grid-cols-1 gap-3 lg:grid-cols-2" aria-label="Lista de avisos">
            {alerts.map((a) => (
              <li key={a.id}>
                <AlertItem alert={a} />
              </li>
            ))}
          </ul>
        )}
      </div>
    </ScreenStates>
  );
}
