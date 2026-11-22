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
