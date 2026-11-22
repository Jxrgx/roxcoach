"use client";

import { useState } from "react";
import { SlidersHorizontal } from "lucide-react";
import { PERIOD_LABEL, PERIODS, STATUS_FILTER_LABEL, STATUS_FILTERS, type Period, type StatusFilter } from "@/lib/progress/metrics";
import { Button } from "@/components/ui/button";
import { BottomSheet } from "@/components/ui/bottom-sheet";
import { Select } from "@/components/ui/field";

interface FiltersProps {
  athletes: { athleteId: string; name: string }[];
  period: Period;
  athleteId: string;
  status: StatusFilter;
}

/**
 * Filtros del progreso del coach como formulario GET (la URL los conserva y
 * se pueden compartir). Mobile: panel inferior; desde tablet: en línea.
 */
function FilterFields({ athletes, period, athleteId, status }: FiltersProps) {
  return (
    <>
      <Select label="Periodo" name="periodo" defaultValue={period}>
        {PERIODS.map((p) => (
          <option key={p} value={p}>
            {PERIOD_LABEL[p]}
          </option>
        ))}
      </Select>
      <Select label="Atleta" name="atleta" defaultValue={athleteId}>
        <option value="">Todos los atletas</option>
        {athletes.map((a) => (
          <option key={a.athleteId} value={a.athleteId}>
            {a.name}
          </option>
        ))}
      </Select>
      <Select label="Estado" name="estado" defaultValue={status}>
        {STATUS_FILTERS.map((s) => (
          <option key={s} value={s}>
            {STATUS_FILTER_LABEL[s]}
          </option>
        ))}
      </Select>
    </>
  );
}

export function ProgressFilters(props: FiltersProps) {
  const [open, setOpen] = useState(false);
  const active = Number(props.period !== "30") + Number(props.athleteId !== "") + Number(props.status !== "todos");

  return (
    <>
      <div className="md:hidden">
        <Button variant="secondary" fullWidth onClick={() => setOpen(true)} icon={<SlidersHorizontal aria-hidden className="size-4" />} aria-haspopup="dialog">
          Filtros{active > 0 ? ` (${active})` : ""} · {PERIOD_LABEL[props.period]}
        </Button>
        <BottomSheet open={open} onClose={() => setOpen(false)} title="Filtrar progreso">
          <form action="/coach/progreso" method="get" className="flex flex-col gap-4">
            <FilterFields {...props} />
            <Button type="submit" size="lg" fullWidth>
              Aplicar filtros
            </Button>
          </form>
        </BottomSheet>
      </div>
      <form action="/coach/progreso" method="get" aria-label="Filtros de progreso" className="hidden items-end gap-3 md:grid md:grid-cols-[1fr_1fr_1fr_auto]">
        <FilterFields {...props} />
        <Button type="submit" variant="secondary">
          Aplicar
        </Button>
      </form>
    </>
  );
}
