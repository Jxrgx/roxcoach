import type { Athlete, Coach } from "@/lib/types/domain";

/**
 * Datos ficticios para visualizar la interfaz. No representan personas reales.
 * Se reemplazarán por consultas en `lib/db` cuando exista persistencia.
 */
export const mockCoach: Coach = {
  id: "coach-1",
  name: "Alex Martínez",
  gym: "Pista Central",
  email: "alex@pistacentral.example",
  weightUnit: "kg",
  distanceUnit: "km",
};

export const mockAthletes: Athlete[] = [
  {
    id: "ath-1",
    name: "Jorge M.",
    division: "Pro Men",
    status: "activo",
    adherence: 92,
    nextSessionLabel: "Hoy · Engine + Sled Push",
    raceInDays: 47,
  },
  {
    id: "ath-2",
    name: "Daniela R.",
    division: "Open Women",
    status: "activo",
    adherence: 88,
    nextSessionLabel: "Hoy · Fuerza + Wall Balls",
    raceInDays: 47,
  },
  {
    id: "ath-3",
    name: "Luis A.",
    division: "Doubles Men",
    status: "pendiente",
    adherence: 61,
    nextSessionLabel: "Mañana · Intervalos 1 km",
    raceInDays: 75,
  },
  {
    id: "ath-4",
    name: "Sofía T.",
    division: "Pro Women",
    status: "activo",
    adherence: 95,
    nextSessionLabel: "Hoy · Engine + Sled Push",
    raceInDays: 47,
  },
  {
    id: "ath-5",
    name: "Marco P.",
    division: "Open Men",
    status: "pendiente",
    adherence: 54,
    nextSessionLabel: "Mañana · Compromised Running",
    raceInDays: 103,
  },
  {
    id: "ath-6",
    name: "Valeria G.",
    division: "Doubles Mixed",
    status: "en_pausa",
    adherence: 40,
    nextSessionLabel: null,
    raceInDays: null,
  },
];
