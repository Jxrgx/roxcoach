"use client";

import { useState } from "react";
import { SearchX, Users } from "lucide-react";
import { filterInvitations, filterRoster, type OpenInvitationItem, type RosterFilter, type RosterItem } from "@/lib/athletes/roster";
import { SearchInput } from "@/components/shared/search-input";
import { Tabs } from "@/components/ui/tabs";
import { EmptyState } from "@/components/ui/empty-state";
import { AthleteCard } from "@/components/coach/athlete-card";
import { InvitationItem } from "@/components/coach/invitation-item";
import { InviteAthleteButton } from "@/components/coach/invite-athlete";

export function AthleteRoster({ athletes, invitations }: { athletes: RosterItem[]; invitations: OpenInvitationItem[] }) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<RosterFilter>("todos");

  if (athletes.length === 0 && invitations.length === 0) {
    return (
      <EmptyState
        icon={<Users />}
        title="Todavía no tienes atletas registrados"
        description="Invita a tu primer atleta con un enlace personal. Cuando lo acepte, aparecerá aquí."
        action={<InviteAthleteButton />}
      />
    );
  }

  const visibleAthletes = filterRoster(athletes, query, filter);
  const visibleInvitations = filter === "invitaciones" ? filterInvitations(invitations, query) : [];
  const count = (f: Exclude<RosterFilter, "invitaciones">) => filterRoster(athletes, "", f).length;
  const nothing = visibleAthletes.length === 0 && visibleInvitations.length === 0;

  return (
    <div className="flex flex-col gap-4">
      <SearchInput label="Buscar atleta" placeholder="Buscar por nombre, correo o división" value={query} onChange={setQuery} />
      <Tabs
        label="Filtrar atletas"
        panelId="lista-atletas"
        value={filter}
        onChange={setFilter}
        items={[
          { value: "todos", label: "Todos", count: count("todos") },
          { value: "active", label: "Activos", count: count("active") },
          { value: "paused", label: "En pausa", count: count("paused") },
          { value: "invitaciones", label: "Invitaciones", count: invitations.length },
        ]}
      />
      <div id="lista-atletas" role="tabpanel" aria-live="polite">
        {nothing ? (
          <EmptyState
            icon={<SearchX />}
            title={filter === "invitaciones" && !query ? "No hay invitaciones pendientes" : "No encontramos resultados"}
            description={
              query
                ? `Nada coincide con “${query}”. Revisa la ortografía o cambia el filtro.`
                : filter === "invitaciones"
                  ? "Las invitaciones aceptadas aparecen como atletas."
                  : "No hay atletas en este estado."
            }
          />
        ) : filter === "invitaciones" ? (
          <ul className="grid grid-cols-1 gap-3 lg:grid-cols-2">
            {visibleInvitations.map((inv) => (
              <li key={inv.id}>
                <InvitationItem invitation={inv} />
              </li>
            ))}
          </ul>
        ) : (
          <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {visibleAthletes.map((a) => (
              <li key={a.athleteId}>
                <AthleteCard
                  href={`/coach/atletas/${a.athleteId}`}
                  athlete={{ name: a.name, division: a.division, status: a.status === "active" ? "activo" : "en_pausa" }}
                  meta={
                    <>
                      <span className="block break-all">{a.email}</span>
                      <span className="block">{a.joinedLabel}</span>
                    </>
                  }
                />
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
