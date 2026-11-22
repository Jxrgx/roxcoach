import type { HyroxDivision, ScheduledSession } from "@/lib/types/domain";
import { engineSledPush } from "@/lib/mock/workouts";

/** Datos ficticios del atleta de demostración. No es una persona real. */
export const mockAthleteProfile = {
  id: "ath-1",
  name: "Jorge M.",
  division: "Pro Men" as HyroxDivision,
  raceInDays: 47,
  raceName: "Carrera objetivo",
  availableDays: ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"],
  equipment: ["Trineo", "SkiErg", "Remo", "Balón medicinal", "Kettlebells", "Pista"],
  coachName: "Alex Martínez",
};

export const todayWorkout = engineSledPush;

/** Plan del atleta relativo a hoy (-6 a +6 días). */
export const mockAthletePlan: ScheduledSession[] = [
  { id: "a-m6", templateId: "tpl-intervals", name: "Intervalos 1 km", dayOffset: -6, time: "07:00", durationMinutes: 50, intensity: "alta", blockCount: 3, athleteIds: ["ath-1"], status: "completada" },
  { id: "a-m5", templateId: "rest", name: "Descanso", dayOffset: -5, time: "", durationMinutes: 0, intensity: "baja", blockCount: 0, athleteIds: ["ath-1"], status: "descanso" },
  { id: "a-m4", templateId: "tpl-sim", name: "Simulación parcial HYROX", dayOffset: -4, time: "08:00", durationMinutes: 75, intensity: "alta", blockCount: 5, athleteIds: ["ath-1"], status: "completada" },
  { id: "a-m3", templateId: "tpl-strength-wb", name: "Fuerza + Wall Balls", dayOffset: -3, time: "07:00", durationMinutes: 55, intensity: "media", blockCount: 3, athleteIds: ["ath-1"], status: "omitida" },
  { id: "a-m2", templateId: "tpl-recovery", name: "Movilidad y recuperación", dayOffset: -2, time: "19:00", durationMinutes: 30, intensity: "baja", blockCount: 2, athleteIds: ["ath-1"], status: "completada" },
  { id: "a-m1", templateId: "tpl-intervals", name: "Intervalos 1 km", dayOffset: -1, time: "07:00", durationMinutes: 50, intensity: "alta", blockCount: 3, athleteIds: ["ath-1"], status: "completada" },
  { id: "a-0", templateId: engineSledPush.id, name: engineSledPush.name, dayOffset: 0, time: "07:00", durationMinutes: engineSledPush.durationMinutes, intensity: engineSledPush.intensity, blockCount: engineSledPush.blocks.length, athleteIds: ["ath-1"], status: "programada" },
  { id: "a-p1", templateId: "tpl-strength-wb", name: "Fuerza + Wall Balls", dayOffset: 1, time: "07:00", durationMinutes: 55, intensity: "media", blockCount: 3, athleteIds: ["ath-1"], status: "programada" },
  { id: "a-p2", templateId: "rest", name: "Descanso", dayOffset: 2, time: "", durationMinutes: 0, intensity: "baja", blockCount: 0, athleteIds: ["ath-1"], status: "descanso" },
  { id: "a-p3", templateId: "tpl-sim", name: "Simulación parcial HYROX", dayOffset: 3, time: "08:00", durationMinutes: 75, intensity: "alta", blockCount: 5, athleteIds: ["ath-1"], status: "programada" },
  { id: "a-p4", templateId: "tpl-recovery", name: "Movilidad y recuperación", dayOffset: 4, time: "10:00", durationMinutes: 30, intensity: "baja", blockCount: 2, athleteIds: ["ath-1"], status: "programada" },
  { id: "a-p5", templateId: "tpl-intervals", name: "Intervalos 1 km", dayOffset: 5, time: "07:00", durationMinutes: 50, intensity: "alta", blockCount: 3, athleteIds: ["ath-1"], status: "programada" },
  { id: "a-p6", templateId: "rest", name: "Descanso", dayOffset: 6, time: "", durationMinutes: 0, intensity: "baja", blockCount: 0, athleteIds: ["ath-1"], status: "descanso" },
];

/** Próximas sesiones de entrenamiento (excluye descansos y hoy). */
export function getUpcomingSessions(plan: ScheduledSession[], count: number): ScheduledSession[] {
  return plan
    .filter((s) => s.dayOffset > 0 && s.status !== "descanso")
    .sort((a, b) => a.dayOffset - b.dayOffset)
    .slice(0, count);
}

export const mockWeeklyProgress = { done: 3, planned: 5 };

export const mockAthleteProgress = {
  completedSessions: 42,
  adherence: 92,
  personalRecords: [
    { id: "pr-1", label: "1 km", value: "3:12", date: "Hace 6 días" },
    { id: "pr-2", label: "Sled Push 50 m (152 kg)", value: "2:41", date: "Hace 3 semanas" },
    { id: "pr-3", label: "Wall Balls 100 reps", value: "4:58", date: "Hace 1 mes" },
    { id: "pr-4", label: "Simulación HYROX completa", value: "1:04:52", date: "Hace 5 semanas" },
  ],
  /** Mejor tiempo por estación: anterior vs. actual (segundos). Menor es mejor. */
  stations: [
    { id: "st-ski", name: "SkiErg 1000 m", previous: 245, current: 236 },
    { id: "st-push", name: "Sled Push 50 m", previous: 172, current: 161 },
    { id: "st-pull", name: "Sled Pull 50 m", previous: 198, current: 201 },
    { id: "st-row", name: "Remo 1000 m", previous: 232, current: 225 },
    { id: "st-wb", name: "Wall Balls 100", previous: 312, current: 298 },
  ],
};
