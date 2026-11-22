"use client";

import { useState } from "react";
import { SearchX } from "lucide-react";
import type { Athlete, AthleteStatus } from "@/lib/types/domain";
import { normalizeSearch } from "@/lib/utils/format";
import { SearchInput } from "@/components/shared/search-input";
import { Tabs } from "@/components/ui/tabs";
import { EmptyState } from "@/components/ui/empty-state";
import { AthleteCard } from "@/components/coach/athlete-card";

type Filter = "todos" | AthleteStatus;

export function filterAthletes(athletes: Athlete[], query: string, status: Filter) {
  const q = normalizeSearch(query);
  return athletes.filter(
    (a) =>
      (status === "todos" || a.status === status) &&
      (q === "" || normalizeSearch(`${a.name} ${a.division}`).includes(q)),
  );
}

export function AthleteList({ athletes }: { athletes: Athlete[] }) {
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<Filter>("todos");
  const visible = filterAthletes(athletes, query, status);
  const count = (s: Filter) => filterAthletes(athletes, "", s).length;

  return (
    <div className="flex flex-col gap-4">
      <SearchInput label="Buscar atleta" placeholder="Buscar por nombre o división" value={query} onChange={setQuery} />
      <Tabs
        label="Filtrar atletas por estado"
        panelId="lista-atletas"
        value={status}
        onChange={setStatus}
        items={[
          { value: "todos", label: "Todos", count: count("todos") },
          { value: "activo", label: "Activos", count: count("activo") },
          { value: "pendiente", label: "Con pendientes", count: count("pendiente") },
          { value: "en_pausa", label: "En pausa", count: count("en_pausa") },
        ]}
      />
      <div id="lista-atletas" role="tabpanel" aria-live="polite">
        {visible.length === 0 ? (
          <EmptyState
            icon={<SearchX />}
            title="No encontramos atletas"
            description={query ? `Nada coincide con “${query}”. Revisa la ortografía o cambia el filtro.` : "No hay atletas en este estado."}
          />
        ) : (
          <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {visible.map((a) => (
              <li key={a.id}>
                <AthleteCard athlete={a} />
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
