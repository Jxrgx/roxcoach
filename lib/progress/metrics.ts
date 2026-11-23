import { activeSeconds } from "@/lib/execution/progress";
import type { DiscomfortIntensityValue, DiscomfortZoneValue } from "@/lib/execution/discomfort";
import { addDaysKey, todayKey } from "@/lib/scheduling/dates";
import type { SessionSnapshotV1 } from "@/lib/scheduling/snapshot";
import type { TargetTypeValue } from "@/lib/workouts/rules";

/**
 * Progreso (funciones puras) calculado SOLO con datos reales.
 *
 * Definiciones (ver docs/architecture.md, fase 8):
 * - asignada: asignación vigente ("asignada") de una sesión no cancelada.
 * - pendiente: asignada, sin comenzar y su día aún no pasa (hoy o futura).
 * - en curso: comenzada y sin finalizar, de hoy o futura.
 * - abandonada: comenzada y sin finalizar, y su día ya pasó.
 * - completada: finalizada por el atleta.
 * - no realizada: sin comenzar y su día ya pasó.
 * Las sesiones canceladas y las asignaciones retiradas se EXCLUYEN de todo
 * (adherencia, conteos, tiempo, RPE, marcas y evolución).
 *
 * Lo planeado (snapshot) solo se usa para saber QUÉ ejercicio es cada serie;
 * los valores medidos son siempre los reales.
 */

export const APP_TZ = "America/Mexico_City";

/** Mínimo de sesiones vencidas para que la adherencia sea concluyente. */
export const MIN_DUE_FOR_ADHERENCE = 3;
/** Debajo de esto (con datos suficientes) es "baja adherencia". */
export const LOW_ADHERENCE = 0.7;
/** Más de esto de tiempo activo se considera un registro inválido (olvidó finalizar). */
export const MAX_VALID_SESSION_SECONDS = 5 * 3600;
/** Puntos mínimos para mostrar una tendencia. */
export const MIN_TREND_POINTS = 2;

export interface ProgressSet {
  blockIndex: number;
  exerciseIndex: number;
  setNumber: number;
  actualReps: number | null;
  actualDistanceMeters: number | null;
  actualDurationSeconds: number | null;
  actualLoadKg: number | null;
  rpe: number | null;
}

export interface ProgressDiscomfort {
  id: string;
  zone: DiscomfortZoneValue;
  intensity: DiscomfortIntensityValue;
  note: string | null;
  exerciseName: string | null;
  createdAt: Date;
}

/** Una asignación con su sesión y su registro (si existe). */
export interface ProgressRecord {
  sessionId: string;
  title: string;
  /** Fecha programada "YYYY-MM-DD". */
  date: string;
  sessionStatus: "programada" | "cancelada";
  assignmentStatus: "asignada" | "retirada";
  snapshot: SessionSnapshotV1;
  log: {
    status: "en_curso" | "completada";
    startedAt: Date;
    finishedAt: Date | null;
    pausedAt: Date | null;
    pausedSeconds: number;
    rpe: number | null;
  } | null;
  sets: ProgressSet[];
  discomforts: ProgressDiscomfort[];
}

export type ProgressState = "pendiente" | "en_curso" | "abandonada" | "completada" | "no_realizada";

export const PROGRESS_STATE_LABEL: Record<ProgressState, string> = {
  pendiente: "Pendiente",
  en_curso: "En curso",
  abandonada: "Abandonada",
  completada: "Completada",
  no_realizada: "No realizada",
};

export function isCounted(r: ProgressRecord): boolean {
  return r.sessionStatus === "programada" && r.assignmentStatus === "asignada";
}

/** Estado de una asignación respecto a hoy (null si se excluye). */
export function classify(r: ProgressRecord, today: string): ProgressState | null {
  if (!isCounted(r)) return null;
  if (r.log?.status === "completada") return "completada";
  if (r.log?.status === "en_curso") return r.date < today ? "abandonada" : "en_curso";
  return r.date < today ? "no_realizada" : "pendiente";
}

/* ---------- Periodos ---------- */

export const PERIODS = ["7", "30", "90", "todo"] as const;
export type Period = (typeof PERIODS)[number];
export const PERIOD_LABEL: Record<Period, string> = { "7": "Últimos 7 días", "30": "Últimos 30 días", "90": "Últimos 90 días", todo: "Todo el historial" };

export function parsePeriod(raw: string | string[] | undefined, fallback: Period = "30"): Period {
  const value = Array.isArray(raw) ? raw[0] : raw;
  return (PERIODS as readonly string[]).includes(value ?? "") ? (value as Period) : fallback;
}

/** Primer día (inclusive) de un periodo que termina hoy; null = sin límite. */
export function periodStart(period: Period, today: string): string | null {
  return period === "todo" ? null : addDaysKey(today, -(Number(period) - 1));
}

/** Asignaciones cuya fecha programada cae en el periodo (hasta hoy, sin futuras salvo "todo"). */
export function inPeriod(records: ProgressRecord[], period: Period, today: string): ProgressRecord[] {
  const start = periodStart(period, today);
  return records.filter((r) => (start === null ? true : r.date >= start && r.date <= today));
}

/** Día (en la zona de la app) en que el atleta terminó la sesión. */
export function finishedDay(r: ProgressRecord): string | null {
  return r.log?.status === "completada" && r.log.finishedAt ? todayKey(APP_TZ, r.log.finishedAt) : null;
}

/** Sesiones completadas cuyo fin cae en los últimos `days` días (en la zona de la app). */
export function completedInLastDays(records: ProgressRecord[], days: number, today: string): number {
  const start = addDaysKey(today, -(days - 1));
  return records.filter((r) => {
    if (!isCounted(r)) return false;
    const day = finishedDay(r);
    return day !== null && day >= start && day <= today;
  }).length;
}

/* ---------- Adherencia ---------- */

export interface AdherenceSummary {
  /** Asignaciones vigentes (incluye pendientes futuras en "todo"). */
  assigned: number;
  started: number;
  completed: number;
  inProgress: number;
  abandoned: number;
  missed: number;
  pending: number;
  /** Sesiones cuyo día ya llegó y cuentan para adherencia. */
  due: number;
  /** completadas / vencidas (0–1), null si no hay vencidas. */
  rate: number | null;
  sufficient: boolean;
}

export function adherence(records: ProgressRecord[], today: string): AdherenceSummary {
  const counts: Record<ProgressState, number> = { pendiente: 0, en_curso: 0, abandonada: 0, completada: 0, no_realizada: 0 };
  for (const r of records) {
    const state = classify(r, today);
    if (state) counts[state]++;
  }
  // Una sesión de hoy aún sin hacer (pendiente o en curso) no penaliza.
  const due = counts.completada + counts.no_realizada + counts.abandonada;
  return {
    assigned: Object.values(counts).reduce((a, b) => a + b, 0),
    started: counts.completada + counts.en_curso + counts.abandonada,
    completed: counts.completada,
    inProgress: counts.en_curso,
    abandoned: counts.abandonada,
    missed: counts.no_realizada,
    pending: counts.pendiente,
    due,
    rate: due === 0 ? null : counts.completada / due,
    sufficient: due >= MIN_DUE_FOR_ADHERENCE,
  };
}

export function isLowAdherence(a: AdherenceSummary): boolean {
  return a.sufficient && a.rate !== null && a.rate < LOW_ADHERENCE;
}

export const percent = (rate: number) => Math.round(rate * 100);

/* ---------- Tiempo y RPE ---------- */

export function trainingTime(records: ProgressRecord[]): { totalSeconds: number; sessions: number; discarded: number } {
  let totalSeconds = 0;
  let sessions = 0;
  let discarded = 0;
  for (const r of records) {
    if (!isCounted(r) || r.log?.status !== "completada" || !r.log.finishedAt) continue;
    const seconds = activeSeconds(r.log, r.log.finishedAt);
    if (seconds <= 0 || seconds > MAX_VALID_SESSION_SECONDS) discarded++;
    else {
      totalSeconds += seconds;
      sessions++;
    }
  }
  return { totalSeconds, sessions, discarded };
}

export function averageRpe(records: ProgressRecord[]): { value: number | null; sessions: number } {
  const values = records.filter((r) => isCounted(r) && r.log?.status === "completada" && r.log.rpe !== null).map((r) => r.log!.rpe!);
  if (values.length === 0) return { value: null, sessions: 0 };
  return { value: Math.round((values.reduce((a, b) => a + b, 0) / values.length) * 10) / 10, sessions: values.length };
}

/** Molestias de sesiones vigentes desde `sinceDay` (inclusive), más recientes primero. */
export function recentDiscomforts(records: ProgressRecord[], sinceDay: string | null): (ProgressDiscomfort & { sessionId: string; sessionTitle: string })[] {
  return records
    .filter(isCounted)
    .flatMap((r) => r.discomforts.map((d) => ({ ...d, sessionId: r.sessionId, sessionTitle: r.title })))
    .filter((d) => sinceDay === null || todayKey(APP_TZ, d.createdAt) >= sinceDay)
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
}

/* ---------- Ejercicios: evolución y marcas ---------- */

/** Estaciones HYROX y carrera: ejercicios del sistema con id fijo (migración add_exercises). */
export const HYROX_EXERCISES: Record<string, { label: string; order: number }> = {
  "00000000-0000-4000-8000-000000000001": { label: "Carrera", order: 0 },
  "00000000-0000-4000-8000-000000000002": { label: "Carrera", order: 0 },
  "00000000-0000-4000-8000-000000000003": { label: "SkiErg", order: 1 },
  "00000000-0000-4000-8000-000000000004": { label: "Sled Push", order: 2 },
  "00000000-0000-4000-8000-000000000005": { label: "Sled Pull", order: 3 },
  "00000000-0000-4000-8000-000000000006": { label: "Burpee Broad Jump", order: 4 },
  "00000000-0000-4000-8000-000000000007": { label: "Remo", order: 5 },
  "00000000-0000-4000-8000-000000000008": { label: "Farmers Carry", order: 6 },
  "00000000-0000-4000-8000-000000000009": { label: "Sandbag Lunges", order: 7 },
  "00000000-0000-4000-8000-000000000010": { label: "Wall Balls", order: 8 },
};

const CATEGORY_GROUP: Record<string, { label: string; order: number }> = {
  carrera: { label: "Carrera", order: 0 },
  estaciones: { label: "Estaciones", order: 9 },
  fuerza: { label: "Fuerza", order: 10 },
  movilidad: { label: "Movilidad", order: 11 },
};

export type MetricKind = "load" | "reps" | "distance" | "duration";

export const METRIC_LABEL: Record<MetricKind, string> = {
  load: "Mayor carga",
  reps: "Más repeticiones",
  distance: "Mayor distancia",
  duration: "Mayor tiempo sostenido",
};

export interface TrendPoint {
  sessionId: string;
  day: string;
  value: number;
}

export interface ExerciseProgress {
  /** exerciseId + tipo de objetivo: nunca se mezclan ejercicios ni objetivos distintos. */
  key: string;
  exerciseId: string;
  name: string;
  targetType: TargetTypeValue;
  /** "Sled Push", "Fuerza"… para agrupar en pantalla. */
  group: string;
  groupOrder: number;
  /** Métrica de la tendencia (carga si alguna serie la registró; si no, el objetivo). */
  metric: MetricKind;
  points: TrendPoint[];
  sufficient: boolean;
  records: { kind: MetricKind; value: number; day: string; sessionId: string }[];
  sessions: number;
}

const targetMetric = (t: TargetTypeValue): MetricKind => (t === "reps" ? "reps" : t === "distance" ? "distance" : "duration");

function setValue(s: ProgressSet, kind: MetricKind): number | null {
  if (kind === "load") return s.actualLoadKg;
  if (kind === "reps") return s.actualReps;
  if (kind === "distance") return s.actualDistanceMeters;
  return s.actualDurationSeconds;
}

/**
 * Evolución y marcas por ejercicio, solo de sesiones COMPLETADAS y vigentes.
 * Valor por sesión = mejor serie (máximo) de esa sesión. Una serie con valor
 * 0 cuenta para la sesión pero nunca es marca.
 */
export function exerciseProgress(records: ProgressRecord[]): ExerciseProgress[] {
  type Acc = { exerciseId: string; name: string; category: string; targetType: TargetTypeValue; perSession: { sessionId: string; day: string; sets: ProgressSet[] }[] };
  const groups = new Map<string, Acc>();

  for (const r of records) {
    const day = finishedDay(r);
    if (!isCounted(r) || day === null) continue;
    const bySessionKey = new Map<string, ProgressSet[]>();
    for (const s of r.sets) {
      const ex = r.snapshot.blocks[s.blockIndex]?.exercises[s.exerciseIndex];
      if (!ex) continue;
      const key = `${ex.exerciseId}|${ex.targetType}`;
      if (!groups.has(key)) groups.set(key, { exerciseId: ex.exerciseId, name: ex.name, category: ex.category, targetType: ex.targetType, perSession: [] });
      bySessionKey.set(key, [...(bySessionKey.get(key) ?? []), s]);
    }
    for (const [key, sets] of bySessionKey) groups.get(key)!.perSession.push({ sessionId: r.sessionId, day, sets });
  }

  return [...groups.entries()]
    .map(([key, g]) => {
      const sessions = [...g.perSession].sort((a, b) => a.day.localeCompare(b.day));
      const hasLoad = sessions.some((p) => p.sets.some((s) => (s.actualLoadKg ?? 0) > 0));
      const metric: MetricKind = hasLoad ? "load" : targetMetric(g.targetType);
      const best = (sets: ProgressSet[], kind: MetricKind) => Math.max(...sets.map((s) => setValue(s, kind) ?? Number.NEGATIVE_INFINITY));
      const points = sessions
        .map((p) => ({ sessionId: p.sessionId, day: p.day, value: best(p.sets, metric) }))
        .filter((p) => Number.isFinite(p.value));

      const kinds: MetricKind[] = hasLoad ? ["load", targetMetric(g.targetType)] : [targetMetric(g.targetType)];
      const records = kinds.flatMap((kind) => {
        let top: { kind: MetricKind; value: number; day: string; sessionId: string } | null = null;
        for (const p of sessions) {
          const v = best(p.sets, kind);
          // Empate: se conserva la primera vez que se logró.
          if (Number.isFinite(v) && v > 0 && (top === null || v > top.value)) top = { kind, value: v, day: p.day, sessionId: p.sessionId };
        }
        return top ? [top] : [];
      });

      const hyrox = HYROX_EXERCISES[g.exerciseId];
      const group = hyrox ?? CATEGORY_GROUP[g.category] ?? { label: "Otros", order: 12 };
      return {
        key,
        exerciseId: g.exerciseId,
        name: g.name,
        targetType: g.targetType,
        group: group.label,
        groupOrder: group.order,
        metric,
        points,
        sufficient: points.length >= MIN_TREND_POINTS,
        records,
        sessions: sessions.length,
      };
    })
    .sort((a, b) => a.groupOrder - b.groupOrder || a.name.localeCompare(b.name, "es"));
}

/** Cambio entre el primer y el último punto (misma métrica y ejercicio). */
export function trendChange(points: TrendPoint[]): number | null {
  if (points.length < MIN_TREND_POINTS) return null;
  return points[points.length - 1]!.value - points[0]!.value;
}

/* ---------- Coach ---------- */

export const STATUS_FILTERS = ["todos", "baja", "molestias"] as const;
export type StatusFilter = (typeof STATUS_FILTERS)[number];
export const STATUS_FILTER_LABEL: Record<StatusFilter, string> = {
  todos: "Todos",
  baja: "Baja adherencia",
  molestias: "Con molestias",
};

export function parseStatusFilter(raw: string | string[] | undefined): StatusFilter {
  const value = Array.isArray(raw) ? raw[0] : raw;
  return (STATUS_FILTERS as readonly string[]).includes(value ?? "") ? (value as StatusFilter) : "todos";
}

export interface AthleteProgressInput {
  athleteId: string;
  name: string;
  relationStatus: "active" | "paused";
  records: ProgressRecord[];
}

export interface AthleteProgressRow {
  athleteId: string;
  name: string;
  relationStatus: "active" | "paused";
  adherence: AdherenceSummary;
  low: boolean;
  discomforts: number;
  lastCompletedDay: string | null;
}

/** Resumen del grupo y por atleta para un periodo, con filtros de estado. */
export function coachOverview(athletes: AthleteProgressInput[], period: Period, today: string, filter: StatusFilter) {
  const since = periodStart(period, today);
  const rows: AthleteProgressRow[] = athletes.map((a) => {
    const scoped = inPeriod(a.records, period, today);
    const summary = adherence(scoped, today);
    const days = a.records.map(finishedDay).filter((d): d is string => d !== null).sort();
    return {
      athleteId: a.athleteId,
      name: a.name,
      relationStatus: a.relationStatus,
      adherence: summary,
      low: isLowAdherence(summary),
      discomforts: recentDiscomforts(a.records, since).length,
      lastCompletedDay: days[days.length - 1] ?? null,
    };
  });

  const total = adherence(
    athletes.flatMap((a) => inPeriod(a.records, period, today)),
    today,
  );
  const visible = rows
    .filter((r) => (filter === "baja" ? r.low : filter === "molestias" ? r.discomforts > 0 : true))
    .sort((a, b) => Number(b.low) - Number(a.low) || b.discomforts - a.discomforts || a.name.localeCompare(b.name, "es"));

  return {
    group: total,
    rows: visible,
    lowCount: rows.filter((r) => r.low).length,
    discomfortCount: rows.filter((r) => r.discomforts > 0).length,
  };
}

/**
 * "Atletas con pendientes" (Inicio del coach): sesiones vencidas del periodo
 * sin completar (no realizadas o abandonadas). Primero baja adherencia y
 * después quien acumula más.
 */
export function pendingAthletes(rows: AthleteProgressRow[]): (AthleteProgressRow & { pendingCount: number })[] {
  return rows
    .map((r) => ({ ...r, pendingCount: r.adherence.missed + r.adherence.abandoned }))
    .filter((r) => r.pendingCount > 0)
    .sort((a, b) => Number(b.low) - Number(a.low) || b.pendingCount - a.pendingCount || a.name.localeCompare(b.name, "es"));
}
