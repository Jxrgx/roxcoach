"use client";

import { useState } from "react";
import { SlidersHorizontal } from "lucide-react";
import { ALERT_KINDS, KIND_LABEL, READ_FILTER_LABEL, READ_FILTERS, type AlertKindValue, type ReadFilter } from "@/lib/alerts/rules";
import { Button } from "@/components/ui/button";
import { BottomSheet } from "@/components/ui/bottom-sheet";
import { Select } from "@/components/ui/field";

interface Props {
  read: ReadFilter;
  kind: AlertKindValue | null;
}

function Fields({ read, kind }: Props) {
  return (
    <>
      <Select label="Estado" name="estado" defaultValue={read}>
        {READ_FILTERS.map((r) => (
          <option key={r} value={r}>
            {READ_FILTER_LABEL[r]}
          </option>
        ))}
      </Select>
      <Select label="Tipo" name="tipo" defaultValue={kind ?? ""}>
        <option value="">Todos los tipos</option>
        {ALERT_KINDS.map((k) => (
          <option key={k} value={k}>
            {KIND_LABEL[k]}
          </option>
        ))}
      </Select>
    </>
  );
}

/** Filtros de la bandeja como formulario GET: panel inferior en mobile, en línea desde tablet. */
export function AlertFilters(props: Props) {
  const [open, setOpen] = useState(false);
  const active = Number(props.read !== "sin-leer") + Number(props.kind !== null);
  return (
    <>
      <div className="md:hidden">
        <Button variant="secondary" fullWidth onClick={() => setOpen(true)} icon={<SlidersHorizontal aria-hidden className="size-4" />} aria-haspopup="dialog">
          Filtros{active > 0 ? ` (${active})` : ""} · {READ_FILTER_LABEL[props.read]}
        </Button>
        <BottomSheet open={open} onClose={() => setOpen(false)} title="Filtrar avisos">
          <form action="/coach/avisos" method="get" className="flex flex-col gap-4">
            <Fields {...props} />
            <Button type="submit" size="lg" fullWidth>
              Aplicar filtros
            </Button>
          </form>
        </BottomSheet>
      </div>
      <form action="/coach/avisos" method="get" aria-label="Filtros de avisos" className="hidden items-end gap-3 md:grid md:grid-cols-[1fr_1fr_auto]">
        <Fields {...props} />
        <Button type="submit" variant="secondary">
          Aplicar
        </Button>
      </form>
    </>
  );
}
