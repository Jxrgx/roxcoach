import type { Exercise, ScheduledSession, WorkoutTemplate } from "@/lib/types/domain";

/** Datos ficticios para visualizar la interfaz. */

export const mockExercises: Exercise[] = [
  { id: "ex-run", name: "Carrera 1 km", category: "carrera", equipment: ["Pista o caminadora"], videoDurationSeconds: 42, cue: "Ritmo constante, zancada corta." },
  { id: "ex-run-int", name: "Intervalos 400 m", category: "carrera", equipment: ["Pista"], videoDurationSeconds: 35, cue: "Recupera trotando 200 m." },
  { id: "ex-ski", name: "SkiErg", category: "estaciones", equipment: ["SkiErg"], videoDurationSeconds: 58, cue: "Cadera atrás, jala con todo el torso." },
  { id: "ex-sled-push", name: "Sled Push", category: "estaciones", equipment: ["Trineo", "Discos"], videoDurationSeconds: 47, cue: "Brazos extendidos, pasos cortos y rápidos." },
  { id: "ex-sled-pull", name: "Sled Pull", category: "estaciones", equipment: ["Trineo", "Cuerda"], videoDurationSeconds: 51, cue: "Mano sobre mano, piernas firmes." },
  { id: "ex-bbj", name: "Burpee Broad Jump", category: "estaciones", equipment: [], videoDurationSeconds: 39, cue: "Aterriza suave y encadena." },
  { id: "ex-row", name: "Remo", category: "estaciones", equipment: ["Remo"], videoDurationSeconds: 44, cue: "Piernas, cadera, brazos." },
  { id: "ex-farmers", name: "Farmers Carry", category: "estaciones", equipment: ["Kettlebells"], videoDurationSeconds: 33, cue: "Hombros abajo, abdomen activo." },
  { id: "ex-lunges", name: "Sandbag Lunges", category: "estaciones", equipment: ["Sandbag"], videoDurationSeconds: 40, cue: "Rodilla trasera toca suave." },
  { id: "ex-wallball", name: "Wall Balls", category: "estaciones", equipment: ["Balón medicinal", "Diana"], videoDurationSeconds: 37, cue: "Sentadilla completa, lanza con cadera." },
  { id: "ex-deadlift", name: "Peso muerto rumano", category: "fuerza", equipment: ["Barra", "Discos"], videoDurationSeconds: 55, cue: "Espalda neutra, bisagra de cadera." },
  { id: "ex-split", name: "Sentadilla búlgara", category: "fuerza", equipment: ["Mancuernas", "Banco"], cue: "Torso alto, rodilla estable." },
  { id: "ex-hip", name: "Movilidad de cadera 90/90", category: "movilidad", equipment: ["Tapete"], videoDurationSeconds: 62, cue: "Respira profundo en cada lado." },
  { id: "ex-tspine", name: "Rotación torácica", category: "movilidad", equipment: ["Tapete"], videoDurationSeconds: 30, cue: "Sigue la mano con la mirada." },
];

export const engineSledPush: WorkoutTemplate = {
  id: "tpl-engine-sled",
  name: "Engine + Sled Push",
  focus: "Resistencia aeróbica y potencia en trineo",
  durationMinutes: 65,
  intensity: "alta",
  status: "publicada",
  timesAssigned: 12,
  equipment: ["Trineo", "Discos", "Pista o caminadora", "Tapete"],
  blocks: [
    {
      id: "b1",
      name: "Running",
      summary: "4 × 1 km a ritmo de carrera",
      exercises: [
        { exerciseId: "ex-run", name: "Carrera 1 km", prescription: "4 × 1 km @ 3:30/km · descanso 90 s" },
      ],
    },
    {
      id: "b2",
      name: "Sled Push",
      summary: "4 × 12.5 m con carga Pro",
      exercises: [
        { exerciseId: "ex-sled-push", name: "Sled Push", prescription: "4 × 12.5 m @ 152 kg · descanso 2 min" },
      ],
    },
    {
      id: "b3",
      name: "Mobility",
      summary: "Cadera y columna torácica",
      exercises: [
        { exerciseId: "ex-hip", name: "Movilidad de cadera 90/90", prescription: "2 × 60 s por lado" },
        { exerciseId: "ex-tspine", name: "Rotación torácica", prescription: "2 × 8 por lado" },
      ],
    },
    {
      id: "b4",
      name: "Cooldown",
      summary: "Trote suave y respiración",
      exercises: [{ exerciseId: "ex-run", name: "Trote regenerativo", prescription: "8 min en zona 1" }],
    },
  ],
};

export const mockTemplates: WorkoutTemplate[] = [
  engineSledPush,
  {
    id: "tpl-strength-wb",
    name: "Fuerza + Wall Balls",
    focus: "Fuerza de pierna y resistencia muscular",
    durationMinutes: 55,
    intensity: "media",
    status: "publicada",
    timesAssigned: 9,
    equipment: ["Barra", "Discos", "Balón medicinal"],
    blocks: [],
  },
  {
    id: "tpl-intervals",
    name: "Intervalos 1 km",
    focus: "Umbral de carrera",
    durationMinutes: 50,
    intensity: "alta",
    status: "publicada",
    timesAssigned: 15,
    equipment: ["Pista"],
    blocks: [],
  },
  {
    id: "tpl-compromised",
    name: "Compromised Running",
    focus: "Carrera tras estaciones",
    durationMinutes: 60,
    intensity: "alta",
    status: "borrador",
    timesAssigned: 0,
    equipment: ["SkiErg", "Remo", "Pista"],
    blocks: [],
  },
  {
    id: "tpl-sim",
    name: "Simulación parcial HYROX",
    focus: "Estaciones 1 a 4 con carrera",
    durationMinutes: 75,
    intensity: "alta",
    status: "publicada",
    timesAssigned: 6,
    equipment: ["SkiErg", "Trineo", "Discos", "Pista"],
    blocks: [],
  },
  {
    id: "tpl-recovery",
    name: "Movilidad y recuperación",
    focus: "Recuperación activa",
    durationMinutes: 30,
    intensity: "baja",
    status: "archivada",
    timesAssigned: 21,
    equipment: ["Tapete"],
    blocks: [],
  },
];

/**
 * Plan del equipo para el coach. `dayOffset` relativo a hoy.
 * Cubre de -6 a +6 días para que cualquier semana (lun–dom) tenga datos.
 */
export const mockCoachSessions: ScheduledSession[] = [
  { id: "s-m6", templateId: "tpl-intervals", name: "Intervalos 1 km", dayOffset: -6, time: "07:00", durationMinutes: 50, intensity: "alta", blockCount: 3, athleteIds: ["ath-1", "ath-4"], status: "completada" },
  { id: "s-m5", templateId: "tpl-strength-wb", name: "Fuerza + Wall Balls", dayOffset: -5, time: "18:00", durationMinutes: 55, intensity: "media", blockCount: 3, athleteIds: ["ath-2", "ath-3"], status: "completada" },
  { id: "s-m4", templateId: "tpl-sim", name: "Simulación parcial HYROX", dayOffset: -4, time: "08:00", durationMinutes: 75, intensity: "alta", blockCount: 5, athleteIds: ["ath-1", "ath-2", "ath-4"], status: "completada" },
  { id: "s-m3", templateId: "tpl-compromised", name: "Compromised Running", dayOffset: -3, time: "07:00", durationMinutes: 60, intensity: "alta", blockCount: 4, athleteIds: ["ath-5"], status: "omitida" },
  { id: "s-m2", templateId: "tpl-recovery", name: "Movilidad y recuperación", dayOffset: -2, time: "19:00", durationMinutes: 30, intensity: "baja", blockCount: 2, athleteIds: ["ath-1", "ath-2", "ath-3", "ath-4"], status: "completada" },
  { id: "s-m1", templateId: "tpl-intervals", name: "Intervalos 1 km", dayOffset: -1, time: "07:00", durationMinutes: 50, intensity: "alta", blockCount: 3, athleteIds: ["ath-1", "ath-3"], status: "completada" },
  { id: "s-0a", templateId: "tpl-engine-sled", name: "Engine + Sled Push", dayOffset: 0, time: "07:00", durationMinutes: 65, intensity: "alta", blockCount: 4, athleteIds: ["ath-1", "ath-4"], status: "en_curso" },
  { id: "s-0b", templateId: "tpl-strength-wb", name: "Fuerza + Wall Balls", dayOffset: 0, time: "18:30", durationMinutes: 55, intensity: "media", blockCount: 3, athleteIds: ["ath-2"], status: "programada" },
  { id: "s-p1", templateId: "tpl-intervals", name: "Intervalos 1 km", dayOffset: 1, time: "07:00", durationMinutes: 50, intensity: "alta", blockCount: 3, athleteIds: ["ath-3"], status: "programada" },
  { id: "s-p1b", templateId: "tpl-compromised", name: "Compromised Running", dayOffset: 1, time: "18:00", durationMinutes: 60, intensity: "alta", blockCount: 4, athleteIds: ["ath-5"], status: "programada" },
  { id: "s-p2", templateId: "tpl-strength-wb", name: "Fuerza + Wall Balls", dayOffset: 2, time: "07:00", durationMinutes: 55, intensity: "media", blockCount: 3, athleteIds: ["ath-1", "ath-2"], status: "programada" },
  { id: "s-p3", templateId: "tpl-sim", name: "Simulación parcial HYROX", dayOffset: 3, time: "08:00", durationMinutes: 75, intensity: "alta", blockCount: 5, athleteIds: ["ath-1", "ath-2", "ath-4"], status: "programada" },
  { id: "s-p4", templateId: "tpl-recovery", name: "Movilidad y recuperación", dayOffset: 4, time: "10:00", durationMinutes: 30, intensity: "baja", blockCount: 2, athleteIds: ["ath-1", "ath-4"], status: "programada" },
  { id: "s-p5", templateId: "tpl-intervals", name: "Intervalos 1 km", dayOffset: 5, time: "07:00", durationMinutes: 50, intensity: "alta", blockCount: 3, athleteIds: ["ath-2", "ath-3"], status: "programada" },
  { id: "s-p6", templateId: "tpl-engine-sled", name: "Engine + Sled Push", dayOffset: 6, time: "07:00", durationMinutes: 65, intensity: "alta", blockCount: 4, athleteIds: ["ath-4"], status: "programada" },
];

export const mockRecentSessions = mockCoachSessions
  .filter((s) => s.dayOffset < 0)
  .sort((a, b) => b.dayOffset - a.dayOffset)
  .slice(0, 4);
