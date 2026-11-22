"use client";

import { useState } from "react";
import { ClipboardList, SearchX } from "lucide-react";
import type { TemplateListItemDTO } from "@/lib/db/templates";
import { filterTemplates, type TemplateFilter } from "@/lib/workouts/rules";
import { SearchInput } from "@/components/shared/search-input";
import { Tabs } from "@/components/ui/tabs";
import { EmptyState } from "@/components/ui/empty-state";
import { ButtonLink } from "@/components/ui/button";
import { TemplateCard } from "@/components/workouts/template-card";

const TABS: { value: TemplateFilter; label: string }[] = [
  { value: "activas", label: "Todas" },
  { value: "publicada", label: "Publicadas" },
  { value: "borrador", label: "Borradores" },
  { value: "archivada", label: "Archivadas" },
];

export function TemplateList({ templates }: { templates: TemplateListItemDTO[] }) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<TemplateFilter>("activas");

  if (templates.length === 0) {
    return (
      <EmptyState
        icon={<ClipboardList />}
        title="Todavía no tienes plantillas"
        description="Crea tu primera plantilla con bloques y ejercicios de tu biblioteca para reutilizarla al programar."
        action={<ButtonLink href="/coach/entrenamientos/nueva">Crear plantilla</ButtonLink>}
      />
    );
  }

  const visible = filterTemplates(templates, query, filter);
  return (
    <div className="flex flex-col gap-4">
      <SearchInput label="Buscar plantilla" placeholder="Buscar por nombre o enfoque" value={query} onChange={setQuery} />
      <Tabs
        label="Filtrar plantillas por estado"
        panelId="lista-plantillas"
        value={filter}
        onChange={setFilter}
        items={TABS.map((t) => ({ ...t, count: filterTemplates(templates, "", t.value).length }))}
      />
      <div id="lista-plantillas" role="tabpanel" aria-live="polite">
        {visible.length === 0 ? (
          <EmptyState
            icon={<SearchX />}
            title={query ? "No encontramos plantillas" : filter === "archivada" ? "No tienes plantillas archivadas" : "No hay plantillas en este estado"}
            description={query ? `Nada coincide con “${query}”.` : "Prueba con otro filtro."}
          />
        ) : (
          <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {visible.map((t) => (
              <li key={t.id}>
                <TemplateCard template={t} />
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
