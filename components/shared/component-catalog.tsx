"use client";

import Link from "next/link";
import { useState, type ReactNode } from "react";
import { Plus, Settings, Trash2 } from "lucide-react";
import { COACH_NAV, ATHLETE_NAV } from "@/lib/navigation";
import { mockAthletes } from "@/lib/mock/coach";
import { mockExercises } from "@/lib/mock/workouts";
import { Button } from "@/components/ui/button";
import { IconButton } from "@/components/ui/icon-button";
import { Input, Select, Textarea } from "@/components/ui/field";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Tabs } from "@/components/ui/tabs";
import { ProgressBar } from "@/components/ui/progress-bar";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { LoadingState } from "@/components/ui/loading-state";
import { Modal } from "@/components/ui/modal";
import { Drawer } from "@/components/ui/drawer";
import { BottomSheet } from "@/components/ui/bottom-sheet";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { useToast } from "@/components/ui/toast";
import { Disclosure } from "@/components/ui/disclosure";
import { WorkoutCard } from "@/components/workouts/workout-card";
import { ExerciseCard } from "@/components/workouts/exercise-card";
import { SessionStatus } from "@/components/workouts/session-status";
import { AthleteCard } from "@/components/coach/athlete-card";
import { Timer } from "@/components/athlete/timer";
import { SetLogger } from "@/components/athlete/set-logger";
import { ForbiddenState, OfflineState, PREVIEW_STATES } from "@/components/shared/screen-states";

function Block({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section aria-labelledby={id} className="border-t border-line py-8">
      <h2 id={id} className="mb-4 text-lg font-semibold text-ink">
        {title}
      </h2>
      {children}
    </section>
  );
}

const COLORS = [
  ["bg", "#0B0D0F", "Fondo"],
  ["surface", "#15191D", "Superficie"],
  ["surface-2", "#20262B", "Superficie elevada"],
  ["line", "#2C3338", "Borde"],
  ["ink", "#F5F5F0", "Texto"],
  ["muted", "#9BA3A8", "Texto secundario"],
  ["acid", "#D7F500", "Acción principal"],
  ["electric", "#4D8DFF", "Secundario / foco"],
  ["positive", "#A8E063", "Positivo"],
  ["warning", "#F2B84B", "Advertencia"],
  ["danger", "#FF6B6B", "Error"],
] as const;

const SWATCH: Record<string, string> = {
  bg: "bg-bg",
  surface: "bg-surface",
  "surface-2": "bg-surface-2",
  line: "bg-line",
  ink: "bg-ink",
  muted: "bg-muted",
  acid: "bg-acid",
  electric: "bg-electric",
  positive: "bg-positive",
  warning: "bg-warning",
  danger: "bg-danger",
};

export function ComponentCatalog() {
  const [tab, setTab] = useState<"a" | "b" | "c">("a");
  const [modal, setModal] = useState(false);
  const [drawer, setDrawer] = useState(false);
  const [sheet, setSheet] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const toast = useToast();
  const athlete = mockAthletes[0];
  const exercise = mockExercises[3];

  return (
    <div>
      <Block id="color" title="Color">
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {COLORS.map(([token, hex, use]) => (
            <li key={token} className="flex items-center gap-3">
              <span aria-hidden className={`size-10 shrink-0 rounded-xl border border-line ${SWATCH[token]}`} />
              <span className="min-w-0 text-sm">
                <span className="block font-medium text-ink">{token}</span>
                <span className="block text-muted">
                  {hex} · {use}
                </span>
              </span>
            </li>
          ))}
        </ul>
      </Block>

      <Block id="botones" title="Button e IconButton">
        <div className="flex flex-wrap items-center gap-3">
          <Button icon={<Plus aria-hidden className="size-5" />}>Primario</Button>
          <Button variant="secondary">Secundario</Button>
          <Button variant="ghost">Ghost</Button>
          <Button variant="danger">Eliminar</Button>
          <Button loading>Guardar</Button>
          <Button size="lg">Grande</Button>
          <Button disabled>Deshabilitado</Button>
          <IconButton label="Configuración" icon={<Settings />} />
          <IconButton label="Eliminar elemento" icon={<Trash2 />} variant="secondary" />
        </div>
      </Block>

      <Block id="campos" title="Input, Select y Textarea">
        <div className="grid grid-cols-1 max-w-2xl gap-4 sm:grid-cols-2">
          <Input label="Nombre" placeholder="Ej. Jorge M." />
          <Input label="Correo" defaultValue="correo-invalido" error="Revisa el formato del correo." />
          <Select label="División" defaultValue="Pro Men">
            <option>Pro Men</option>
            <option>Open Women</option>
          </Select>
          <Input label="Carga" hint="En kilogramos." inputMode="decimal" optional />
          <div className="sm:col-span-2">
            <Textarea label="Comentario para el atleta" placeholder="Indicaciones técnicas" optional />
          </div>
        </div>
      </Block>

      <Block id="estado" title="Badge, SessionStatus, ProgressBar y Tabs">
        <div className="flex flex-wrap gap-2">
          <Badge>Neutral</Badge>
          <Badge tone="acid">Destacado</Badge>
          <Badge tone="info">Info</Badge>
          <Badge tone="positive">Positivo</Badge>
          <Badge tone="warning">Advertencia</Badge>
          <Badge tone="danger">Error</Badge>
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          {(["programada", "en_curso", "completada", "omitida", "descanso"] as const).map((s) => (
            <SessionStatus key={s} status={s} />
          ))}
        </div>
        <div className="mt-5 grid grid-cols-1 max-w-md gap-4">
          <ProgressBar value={62} label="Progreso de la sesión" showLabel />
          <ProgressBar value={3} max={5} label="Semana" showLabel valueText="3 de 5" tone="positive" />
        </div>
        <div className="mt-5">
          <Tabs
            label="Ejemplo"
            value={tab}
            onChange={setTab}
            items={[
              { value: "a", label: "Todas", count: 12 },
              { value: "b", label: "Pendientes", count: 4 },
              { value: "c", label: "Completadas", count: 8 },
            ]}
          />
        </div>
      </Block>

      <Block id="dialogos" title="Modal, Drawer, BottomSheet, ConfirmDialog y Toast">
        <div className="flex flex-wrap gap-3">
          <Button variant="secondary" onClick={() => setModal(true)}>
            Abrir modal
          </Button>
          <Button variant="secondary" onClick={() => setDrawer(true)}>
            Abrir drawer
          </Button>
          <Button variant="secondary" onClick={() => setSheet(true)}>
            Abrir bottom sheet
          </Button>
          <Button variant="danger" onClick={() => setConfirm(true)}>
            Acción destructiva
          </Button>
          <Button variant="secondary" onClick={() => toast.show({ tone: "success", title: "Guardado", description: "Los cambios se guardaron." })}>
            Toast éxito
          </Button>
          <Button variant="secondary" onClick={() => toast.show({ tone: "error", title: "No se pudo guardar", description: "Intenta de nuevo." })}>
            Toast error
          </Button>
        </div>
        <Modal
          open={modal}
          onClose={() => setModal(false)}
          title="Modal de ejemplo"
          description="Para decisiones o formularios cortos."
          footer={<Button onClick={() => setModal(false)}>Entendido</Button>}
        >
          <p className="text-ink">Contenido del modal. Se cierra con Escape, con el botón o al tocar el fondo.</p>
        </Modal>
        <Drawer open={drawer} onClose={() => setDrawer(false)} title="Detalle del atleta">
          {athlete && <AthleteCard athlete={athlete} />}
        </Drawer>
        <BottomSheet open={sheet} onClose={() => setSheet(false)} title="Opciones del ejercicio">
          <ul className="flex flex-col gap-1">
            {["Ver video", "Ver instrucciones", "Sustituir ejercicio", "Reportar molestia", "Agregar comentario"].map((o) => (
              <li key={o}>
                <button type="button" onClick={() => setSheet(false)} className="flex min-h-13 w-full items-center rounded-xl px-3 text-left text-ink hover:bg-surface-2">
                  {o}
                </button>
              </li>
            ))}
          </ul>
        </BottomSheet>
        <ConfirmDialog
          open={confirm}
          onClose={() => setConfirm(false)}
          onConfirm={() => setConfirm(false)}
          title="¿Eliminar plantilla?"
          description="Las sesiones ya programadas no se modificarán. Esta acción no se puede deshacer."
          confirmLabel="Eliminar plantilla"
        />
      </Block>

      <Block id="estados" title="EmptyState, LoadingState, ErrorState, sin conexión y sin permisos">
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <EmptyState title="Todavía no tienes atletas registrados" description="Agrega a tu primer atleta." />
          <ErrorState onRetry={() => undefined} />
          <OfflineState onRetry={() => undefined} />
          <ForbiddenState />
          <div className="lg:col-span-2">
            <LoadingState rows={2} />
          </div>
        </div>
      </Block>

      <Block id="dominio" title="WorkoutCard, ExerciseCard, AthleteCard y Disclosure">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
          <WorkoutCard name="Engine + Sled Push" when="Hoy · 07:00" durationMinutes={65} intensity="alta" blockCount={4} status="en_curso" athleteCount={2} />
          {exercise && <ExerciseCard exercise={exercise} />}
          {athlete && <AthleteCard athlete={athlete} />}
          <Disclosure title="Sled Push" meta="4 × 12.5 m con carga Pro">
            <p className="text-sm text-muted">Brazos extendidos, pasos cortos y rápidos.</p>
          </Disclosure>
        </div>
      </Block>

      <Block id="ejecucion" title="Timer y SetLogger (ejecución del atleta)">
        <div className="grid grid-cols-1 max-w-3xl gap-4 md:grid-cols-2">
          <Timer label="Descanso entre series" mode="countdown" durationSeconds={90} />
          <Timer label="Tiempo del bloque" />
          <div className="md:col-span-2 md:max-w-md">
            <SetLogger
              exerciseName="Sled Push"
              setNumber={2}
              totalSets={4}
              planned={{ loadKg: 152, distanceMeters: 12.5 }}
              onSave={() => new Promise((r) => setTimeout(r, 700))}
            />
          </div>
        </div>
      </Block>

      <Block id="vistas" title="Vista previa de estados por pantalla">
        <p className="mb-4 text-sm text-muted">
          Cada pantalla con datos acepta <code className="rounded bg-surface-2 px-1">?estado=</code>{" "}
          {PREVIEW_STATES.join(", ")}.
        </p>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {[
            ["Coach", COACH_NAV],
            ["Atleta", ATHLETE_NAV],
          ].map(([group, items]) => (
            <Card key={group as string} padding="sm">
              <h3 className="mb-2 font-semibold text-ink">{group as string}</h3>
              <ul className="flex flex-col gap-2">
                {(items as typeof COACH_NAV).map((item) => (
                  <li key={item.href} className="text-sm">
                    <span className="text-ink">{item.label}: </span>
                    <span className="inline-flex flex-wrap gap-x-3">
                      {PREVIEW_STATES.map((s) => (
                        <Link key={s} href={`${item.href}?estado=${s}`} className="inline-flex min-h-11 min-w-11 items-center justify-center text-electric hover:underline">
                          {s}
                        </Link>
                      ))}
                    </span>
                  </li>
                ))}
              </ul>
            </Card>
          ))}
        </div>
      </Block>
    </div>
  );
}
