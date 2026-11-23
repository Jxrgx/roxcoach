import { DISCOMFORT_INTENSITY_LABEL, DISCOMFORT_ZONE_LABEL, type DiscomfortIntensityValue, type DiscomfortZoneValue } from "@/lib/execution/discomfort";
import { formatKeyShort } from "@/lib/scheduling/dates";

/**
 * Avisos operativos del coach (funciones puras).
 * Un aviso se identifica por (coach, tipo, registro de origen): generarlo dos
 * veces produce la misma clave, así que la sincronización es idempotente.
 */

export const ALERT_KINDS = ["molestia", "sesion_incompleta", "rpe_alto", "en_curso_prolongada", "no_iniciada", "relacion_aceptada"] as const;
export type AlertKindValue = (typeof ALERT_KINDS)[number];

export type AlertPriority = 1 | 2 | 3 | 4;

/** Prioridad fija por tipo: molestias → revisar → seguimiento → información. */
export const KIND_PRIORITY: Record<AlertKindValue, AlertPriority> = {
  molestia: 1,
  sesion_incompleta: 2,
  rpe_alto: 2,
  en_curso_prolongada: 2,
  no_iniciada: 3,
  relacion_aceptada: 4,
};

export const KIND_LABEL: Record<AlertKindValue, string> = {
  molestia: "Molestias",
  sesion_incompleta: "Sesiones incompletas",
  rpe_alto: "RPE alto",
  en_curso_prolongada: "En curso demasiado tiempo",
  no_iniciada: "No iniciadas",
  relacion_aceptada: "Nuevos atletas",
};

export const PRIORITY_LABEL: Record<AlertPriority, string> = {
  1: "Prioritaria",
  2: "Revisar",
  3: "Seguimiento",
  4: "Información",
};

/** RPE general desde el que se avisa. */
export const HIGH_RPE = 9;
/** Una sesión en curso por más de esto se considera prolongada (mismo límite que el progreso). */
export const PROLONGED_SECONDS = 5 * 3600;
/** Solo eventos recientes generan avisos (evita inundar la bandeja). */
export const ALERT_WINDOW_DAYS = 30;

export const MEDICAL_DISCLAIMER = "Reporte del atleta; no constituye un diagnóstico médico.";

/* ---------- Entradas (lo que la BD entrega) ---------- */

export interface AthleteRef {
  athleteId: string;
  name: string;
}

export interface DiscomfortEvent {
  id: string;
  athleteId: string;
  sessionId: string;
  sessionTitle: string;
  zone: DiscomfortZoneValue;
  intensity: DiscomfortIntensityValue;
  exerciseName: string | null;
  createdAt: Date;
}

export interface LogEvent {
  logId: string;
  athleteId: string;
  sessionId: string;
  sessionTitle: string;
  sessionStatus: "programada" | "cancelada";
  assignmentStatus: "asignada" | "retirada";
  status: "en_curso" | "completada";
  startedAt: Date;
  finishedAt: Date | null;
  rpe: number | null;
  loggedSets: number;
  plannedSets: number;
}

export interface MissedEvent {
  assignmentId: string;
  athleteId: string;
  sessionId: string;
  sessionTitle: string;
  sessionStatus: "programada" | "cancelada";
  assignmentStatus: "asignada" | "retirada";
  /** "YYYY-MM-DD" */
  date: string;
  started: boolean;
}

export interface RelationEvent {
  invitationId: string;
  athleteId: string;
  acceptedAt: Date;
}

export interface AlertCandidate {
  kind: AlertKindValue;
  sourceId: string;
  athleteId: string;
  sessionId: string | null;
  priority: AlertPriority;
  title: string;
  description: string;
  athleteName: string;
  eventAt: Date;
}

export const alertKey = (a: { kind: AlertKindValue; sourceId: string }) => `${a.kind}:${a.sourceId}`;

/** Día en que deja de contar la ventana (inclusive). */
export function windowStart(now: Date, days = ALERT_WINDOW_DAYS): Date {
  return new Date(now.getTime() - days * 86_400_000);
}

/**
 * Convierte eventos reales en candidatos a aviso. Solo atletas ACTIVOS del
 * coach (`athletes`); excluye sesiones canceladas y asignaciones retiradas,
 * salvo las molestias (señal de salud: se avisan aunque la sesión se cancele).
 */
export function buildAlertCandidates(
  input: { athletes: AthleteRef[]; discomforts: DiscomfortEvent[]; logs: LogEvent[]; missed: MissedEvent[]; relations: RelationEvent[] },
  now: Date,
  today: string,
): AlertCandidate[] {
  const names = new Map(input.athletes.map((a) => [a.athleteId, a.name]));
  const since = windowStart(now);
  const out: AlertCandidate[] = [];
  const push = (c: Omit<AlertCandidate, "priority" | "athleteName">) => {
    const athleteName = names.get(c.athleteId);
    if (!athleteName || c.eventAt < since || c.eventAt > now) return;
    out.push({ ...c, priority: KIND_PRIORITY[c.kind], athleteName });
  };

  for (const d of input.discomforts) {
    push({
      kind: "molestia",
      sourceId: d.id,
      athleteId: d.athleteId,
      sessionId: d.sessionId,
      title: `Molestia ${DISCOMFORT_INTENSITY_LABEL[d.intensity].toLowerCase()} · ${DISCOMFORT_ZONE_LABEL[d.zone]}`,
      description: `Reportada en "${d.sessionTitle}"${d.exerciseName ? `, durante ${d.exerciseName}` : ""}.`,
      eventAt: d.createdAt,
    });
  }

  for (const l of input.logs) {
    if (l.sessionStatus !== "programada" || l.assignmentStatus !== "asignada") continue;
    if (l.status === "completada" && l.finishedAt) {
      if (l.plannedSets > 0 && l.loggedSets < l.plannedSets) {
        push({
          kind: "sesion_incompleta",
          sourceId: l.logId,
          athleteId: l.athleteId,
          sessionId: l.sessionId,
          title: "Sesión finalizada incompleta",
          description: `Registró ${l.loggedSets} de ${l.plannedSets} series en "${l.sessionTitle}".`,
          eventAt: l.finishedAt,
        });
      }
      if (l.rpe !== null && l.rpe >= HIGH_RPE) {
        push({
          kind: "rpe_alto",
          sourceId: l.logId,
          athleteId: l.athleteId,
          sessionId: l.sessionId,
          title: `RPE alto (${l.rpe}/10)`,
          description: `Calificó "${l.sessionTitle}" con un esfuerzo de ${l.rpe} sobre 10.`,
          eventAt: l.finishedAt,
        });
      }
    } else if (l.status === "en_curso" && now.getTime() - l.startedAt.getTime() > PROLONGED_SECONDS * 1000) {
      push({
        kind: "en_curso_prolongada",
        sourceId: l.logId,
        athleteId: l.athleteId,
        sessionId: l.sessionId,
        title: "Sesión en curso por más de 5 h",
        description: `Comenzó "${l.sessionTitle}" y no la ha finalizado.`,
        eventAt: new Date(l.startedAt.getTime() + PROLONGED_SECONDS * 1000),
      });
    }
  }

  for (const m of input.missed) {
    if (m.sessionStatus !== "programada" || m.assignmentStatus !== "asignada" || m.started || m.date >= today) continue;
    push({
      kind: "no_iniciada",
      sourceId: m.assignmentId,
      athleteId: m.athleteId,
      sessionId: m.sessionId,
      title: "Sesión no iniciada",
      description: `No comenzó "${m.sessionTitle}" (${formatKeyShort(m.date)}).`,
      eventAt: missedAt(m.date, now),
    });
  }

  for (const r of input.relations) {
    push({
      kind: "relacion_aceptada",
      sourceId: r.invitationId,
      athleteId: r.athleteId,
      sessionId: null,
      title: "Nuevo atleta en tu equipo",
      description: "Aceptó tu invitación.",
      eventAt: r.acceptedAt,
    });
  }

  return dedupeAlerts(out);
}

/**
 * Momento en que una sesión queda "no iniciada": la medianoche (Ciudad de
 * México, UTC−6 → 06:00 UTC) del día siguiente; nunca después de `now`.
 */
export function missedAt(date: string, now: Date): Date {
  const nextMidnight = new Date(new Date(`${date}T06:00:00Z`).getTime() + 86_400_000);
  return nextMidnight > now ? now : nextMidnight;
}

/** Estado actual de la asignación de un aviso "no iniciada" (null si ya no existe). */
export interface MissedSourceState {
  assignmentStatus: "asignada" | "retirada";
  sessionStatus: "programada" | "cancelada";
  /** Tiene registro de ejecución (en curso, abandonada o completada). */
  started: boolean;
}

/**
 * Un aviso "no iniciada" deja de estar pendiente si el atleta comenzó la
 * sesión (en curso, abandonada o completada), si la sesión se canceló, si se
 * retiró al atleta o si la asignación ya no existe.
 */
export function shouldResolveMissed(source: MissedSourceState | null): boolean {
  return source === null || source.started || source.sessionStatus === "cancelada" || source.assignmentStatus === "retirada";
}

/** Un aviso cuenta como pendiente solo si no se leyó ni se resolvió. */
export function isPendingAlert(a: { readAt: Date | null; resolvedAt: Date | null }): boolean {
  return a.readAt === null && a.resolvedAt === null;
}

/** Una sola entrada por clave (la primera). */
export function dedupeAlerts<T extends { kind: AlertKindValue; sourceId: string }>(items: T[]): T[] {
  const seen = new Set<string>();
  return items.filter((a) => {
    const key = alertKey(a);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/** Candidatos que aún no existen (lo que una sincronización insertaría). */
export function pendingInserts<T extends { kind: AlertKindValue; sourceId: string }>(candidates: T[], existingKeys: ReadonlySet<string>): T[] {
  return dedupeAlerts(candidates).filter((c) => !existingKeys.has(alertKey(c)));
}

/** Orden de la bandeja: pendientes primero (ni leídos ni resueltos), luego prioridad y evento más reciente. */
export function sortAlerts<T extends { priority: number; eventAt: Date; readAt: Date | null; resolvedAt?: Date | null }>(items: T[]): T[] {
  const done = (x: T) => Number(!isPendingAlert({ readAt: x.readAt, resolvedAt: x.resolvedAt ?? null }));
  return [...items].sort((a, b) => done(a) - done(b) || a.priority - b.priority || b.eventAt.getTime() - a.eventAt.getTime());
}

/** Pantalla a la que lleva el aviso (null si el origen ya no existe). */
export function alertHref(a: { kind: AlertKindValue; athleteId: string | null; sessionId: string | null }): string | null {
  if (!a.athleteId) return null;
  if (a.kind === "relacion_aceptada") return `/coach/atletas/${a.athleteId}`;
  if (!a.sessionId) return null;
  if (a.kind === "no_iniciada") return `/coach/sesiones/${a.sessionId}`;
  return `/coach/sesiones/${a.sessionId}/atletas/${a.athleteId}`;
}

/* ---------- Filtros de la bandeja ---------- */

export const READ_FILTERS = ["sin-leer", "leidos", "todos"] as const;
export type ReadFilter = (typeof READ_FILTERS)[number];
export const READ_FILTER_LABEL: Record<ReadFilter, string> = { "sin-leer": "Sin leer", leidos: "Leídos", todos: "Todos" };

export function parseReadFilter(raw: string | string[] | undefined): ReadFilter {
  const v = Array.isArray(raw) ? raw[0] : raw;
  return (READ_FILTERS as readonly string[]).includes(v ?? "") ? (v as ReadFilter) : "sin-leer";
}

export function parseKindFilter(raw: string | string[] | undefined): AlertKindValue | null {
  const v = Array.isArray(raw) ? raw[0] : raw;
  return (ALERT_KINDS as readonly string[]).includes(v ?? "") ? (v as AlertKindValue) : null;
}
