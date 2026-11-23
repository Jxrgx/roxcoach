import { describe, expect, it } from "vitest";
import {
  alertHref,
  alertKey,
  buildAlertCandidates,
  dedupeAlerts,
  isPendingAlert,
  KIND_PRIORITY,
  missedAt,
  parseKindFilter,
  parseReadFilter,
  pendingInserts,
  shouldResolveMissed,
  sortAlerts,
  type DiscomfortEvent,
  type LogEvent,
  type MissedEvent,
} from "@/lib/alerts/rules";

const NOW = new Date("2026-11-24T18:00:00Z"); // 12:00 en Ciudad de México
const TODAY = "2026-11-24";
const ANA = { athleteId: "a1", name: "Ana" };

const discomfort = (over: Partial<DiscomfortEvent> = {}): DiscomfortEvent => ({
  id: "d1",
  athleteId: "a1",
  sessionId: "s1",
  sessionTitle: "Engine",
  zone: "rodilla",
  intensity: "moderada",
  exerciseName: "Sled Push",
  createdAt: new Date("2026-11-23T16:00:00Z"),
  ...over,
});

const log = (over: Partial<LogEvent> = {}): LogEvent => ({
  logId: "l1",
  athleteId: "a1",
  sessionId: "s1",
  sessionTitle: "Engine",
  sessionStatus: "programada",
  assignmentStatus: "asignada",
  status: "completada",
  startedAt: new Date("2026-11-23T15:00:00Z"),
  finishedAt: new Date("2026-11-23T16:00:00Z"),
  rpe: 7,
  loggedSets: 5,
  plannedSets: 5,
  ...over,
});

const missed = (over: Partial<MissedEvent> = {}): MissedEvent => ({
  assignmentId: "as1",
  athleteId: "a1",
  sessionId: "s2",
  sessionTitle: "Fuerza",
  sessionStatus: "programada",
  assignmentStatus: "asignada",
  date: "2026-11-22",
  started: false,
  ...over,
});

const build = (input: Partial<Parameters<typeof buildAlertCandidates>[0]>) =>
  buildAlertCandidates({ athletes: [ANA], discomforts: [], logs: [], missed: [], relations: [], ...input }, NOW, TODAY);

describe("generación de avisos", () => {
  it("molestia: prioridad 1, sin diagnóstico, con zona, intensidad y ejercicio", () => {
    const [a] = build({ discomforts: [discomfort()] });
    expect(a).toMatchObject({ kind: "molestia", priority: 1, title: "Molestia moderada · Rodilla", athleteName: "Ana", sessionId: "s1" });
    expect(a!.description).toBe('Reportada en "Engine", durante Sled Push.');
  });

  it("sesión incompleta y RPE alto (≥ 9) salen del mismo registro con claves distintas", () => {
    const out = build({ logs: [log({ loggedSets: 3, rpe: 9 })] });
    expect(out.map((a) => [a.kind, a.priority])).toEqual([
      ["sesion_incompleta", 2],
      ["rpe_alto", 2],
    ]);
    expect(out[0]!.description).toContain("3 de 5 series");
    expect(new Set(out.map(alertKey)).size).toBe(2);
    expect(build({ logs: [log({ rpe: 8 })] })).toEqual([]);
  });

  it("en curso más de 5 h genera aviso; menos, no", () => {
    expect(build({ logs: [log({ status: "en_curso", finishedAt: null, rpe: null, startedAt: new Date("2026-11-24T12:00:00Z") })] }).map((a) => a.kind)).toEqual([
      "en_curso_prolongada",
    ]);
    expect(build({ logs: [log({ status: "en_curso", finishedAt: null, startedAt: new Date("2026-11-24T15:00:00Z") })] })).toEqual([]);
  });

  it("no iniciada solo cuando el día ya pasó, a partir de la medianoche de México", () => {
    const [a] = build({ missed: [missed()] });
    expect(a).toMatchObject({ kind: "no_iniciada", priority: 3 });
    expect(a!.eventAt.toISOString()).toBe("2026-11-23T06:00:00.000Z");
    expect(build({ missed: [missed({ date: TODAY })] })).toEqual([]);
    expect(build({ missed: [missed({ started: true })] })).toEqual([]);
    expect(missedAt("2026-11-24", NOW)).toEqual(NOW); // nunca en el futuro
  });

  it("relación aceptada: información (prioridad 4)", () => {
    const [a] = build({ relations: [{ invitationId: "i1", athleteId: "a1", acceptedAt: new Date("2026-11-20T10:00:00Z") }] });
    expect(a).toMatchObject({ kind: "relacion_aceptada", priority: 4, sessionId: null });
  });
});

describe("exclusiones y permisos", () => {
  it("excluye sesiones canceladas y asignaciones retiradas (salvo molestias)", () => {
    expect(build({ logs: [log({ loggedSets: 1, sessionStatus: "cancelada" })] })).toEqual([]);
    expect(build({ logs: [log({ rpe: 10, assignmentStatus: "retirada" })] })).toEqual([]);
    expect(build({ missed: [missed({ sessionStatus: "cancelada" })] })).toEqual([]);
    expect(build({ missed: [missed({ assignmentStatus: "retirada" })] })).toEqual([]);
    // La molestia es una señal de salud: se avisa aunque la sesión se haya cancelado.
    expect(build({ discomforts: [discomfort()] })).toHaveLength(1);
  });

  it("solo atletas activos del coach: eventos de otros atletas se ignoran", () => {
    expect(build({ discomforts: [discomfort({ athleteId: "ajeno" })], logs: [log({ athleteId: "ajeno", rpe: 10 })] })).toEqual([]);
  });

  it("solo eventos de los últimos 30 días y nunca futuros", () => {
    expect(build({ discomforts: [discomfort({ createdAt: new Date("2026-10-20T10:00:00Z") })] })).toEqual([]);
    expect(build({ discomforts: [discomfort({ createdAt: new Date("2026-11-25T10:00:00Z") })] })).toEqual([]);
  });
});

describe("deduplicación e idempotencia", () => {
  it("el mismo evento produce la misma clave y se deduplica", () => {
    const twice = build({ discomforts: [discomfort(), discomfort()] });
    expect(twice).toHaveLength(1);
    expect(dedupeAlerts([{ kind: "molestia" as const, sourceId: "x" }, { kind: "molestia" as const, sourceId: "x" }])).toHaveLength(1);
  });

  it("generar de nuevo con los mismos datos no inserta nada", () => {
    const first = build({ discomforts: [discomfort()], logs: [log({ rpe: 9 })], missed: [missed()] });
    const existing = new Set(first.map(alertKey));
    const second = build({ discomforts: [discomfort()], logs: [log({ rpe: 9 })], missed: [missed()] });
    expect(pendingInserts(second, existing)).toEqual([]);
    // Un evento nuevo sí se inserta.
    const third = build({ discomforts: [discomfort(), discomfort({ id: "d2" })] });
    expect(pendingInserts(third, existing).map((a) => a.sourceId)).toEqual(["d2"]);
  });
});

describe("orden, leídos y enlaces", () => {
  const at = (iso: string) => new Date(iso);
  it("no leídos primero; luego prioridad y fecha más reciente", () => {
    const items = [
      { id: "info", priority: 4, eventAt: at("2026-11-24T10:00:00Z"), readAt: null },
      { id: "molestia-vieja", priority: 1, eventAt: at("2026-11-20T10:00:00Z"), readAt: null },
      { id: "molestia-leida", priority: 1, eventAt: at("2026-11-24T11:00:00Z"), readAt: at("2026-11-24T12:00:00Z") },
      { id: "revisar", priority: 2, eventAt: at("2026-11-23T10:00:00Z"), readAt: null },
      { id: "molestia-nueva", priority: 1, eventAt: at("2026-11-23T10:00:00Z"), readAt: null },
    ];
    expect(sortAlerts(items).map((i) => i.id)).toEqual(["molestia-nueva", "molestia-vieja", "revisar", "info", "molestia-leida"]);
  });

  it("prioridad por tipo sigue el orden pedido", () => {
    expect(KIND_PRIORITY.molestia).toBeLessThan(KIND_PRIORITY.sesion_incompleta);
    expect(KIND_PRIORITY.rpe_alto).toBe(KIND_PRIORITY.sesion_incompleta);
    expect(KIND_PRIORITY.sesion_incompleta).toBeLessThan(KIND_PRIORITY.no_iniciada);
    expect(KIND_PRIORITY.no_iniciada).toBeLessThan(KIND_PRIORITY.relacion_aceptada);
  });

  it("cada aviso enlaza a su pantalla; sin origen, sin enlace", () => {
    expect(alertHref({ kind: "molestia", athleteId: "a1", sessionId: "s1" })).toBe("/coach/sesiones/s1/atletas/a1");
    expect(alertHref({ kind: "no_iniciada", athleteId: "a1", sessionId: "s1" })).toBe("/coach/sesiones/s1");
    expect(alertHref({ kind: "relacion_aceptada", athleteId: "a1", sessionId: null })).toBe("/coach/atletas/a1");
    expect(alertHref({ kind: "rpe_alto", athleteId: null, sessionId: "s1" })).toBeNull();
    expect(alertHref({ kind: "rpe_alto", athleteId: "a1", sessionId: null })).toBeNull();
  });

  it("filtros con valores seguros por defecto", () => {
    expect(parseReadFilter("leidos")).toBe("leidos");
    expect(parseReadFilter("otro")).toBe("sin-leer");
    expect(parseKindFilter("molestia")).toBe("molestia");
    expect(parseKindFilter("hack")).toBeNull();
  });
});

describe("resolución de avisos 'no iniciada'", () => {
  const base = { assignmentStatus: "asignada" as const, sessionStatus: "programada" as const, started: false };
  it("sigue pendiente mientras la sesión no se comience", () => {
    expect(shouldResolveMissed(base)).toBe(false);
  });
  it("se resuelve al iniciar (en curso, abandonada o completada), al cancelar, al retirar o si ya no existe", () => {
    expect(shouldResolveMissed({ ...base, started: true })).toBe(true);
    expect(shouldResolveMissed({ ...base, sessionStatus: "cancelada" })).toBe(true);
    expect(shouldResolveMissed({ ...base, assignmentStatus: "retirada" })).toBe(true);
    expect(shouldResolveMissed(null)).toBe(true);
  });
  it("pendiente = ni leído ni resuelto; resolver no cambia read_at", () => {
    const read = new Date("2026-11-24T10:00:00Z");
    expect(isPendingAlert({ readAt: null, resolvedAt: null })).toBe(true);
    expect(isPendingAlert({ readAt: null, resolvedAt: new Date() })).toBe(false);
    const alreadyRead = { readAt: read, resolvedAt: new Date() };
    expect(alreadyRead.readAt).toBe(read);
    expect(isPendingAlert(alreadyRead)).toBe(false);
  });
  it("los resueltos se ordenan después de los pendientes", () => {
    const t = new Date("2026-11-24T10:00:00Z");
    const items = [
      { id: "resuelto", priority: 3, eventAt: t, readAt: null, resolvedAt: t },
      { id: "pendiente", priority: 3, eventAt: new Date("2026-11-20T10:00:00Z"), readAt: null, resolvedAt: null },
    ];
    expect(sortAlerts(items).map((i) => i.id)).toEqual(["pendiente", "resuelto"]);
  });
});
