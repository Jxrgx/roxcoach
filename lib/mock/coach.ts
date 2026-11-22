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

export interface CoachComment {
  id: string;
  athleteName: string;
  sessionName: string;
  text: string;
  when: string;
}

export const mockRecentComments: CoachComment[] = [
  {
    id: "c-1",
    athleteName: "Daniela R.",
    sessionName: "Simulación parcial",
    text: "Los wall balls se me complicaron después del remo, bajé a series de 15.",
    when: "Hace 2 h",
  },
  {
    id: "c-2",
    athleteName: "Jorge M.",
    sessionName: "Intervalos 1 km",
    text: "Mantuve 3:25 en todas las repeticiones. RPE 8.",
    when: "Ayer",
  },
  {
    id: "c-3",
    athleteName: "Luis A.",
    sessionName: "Fuerza + Wall Balls",
    text: "Molestia ligera en rodilla izquierda en lunges.",
    when: "Ayer",
  },
];

export interface Conversation {
  id: string;
  athleteId: string;
  athleteName: string;
  unread: number;
  messages: Array<{ id: string; from: "coach" | "athlete"; text: string; time: string }>;
}

export const mockConversations: Conversation[] = [
  {
    id: "conv-1",
    athleteId: "ath-1",
    athleteName: "Jorge M.",
    unread: 2,
    messages: [
      { id: "m1", from: "coach", text: "Hoy toca Engine + Sled Push. Cuida el ritmo en los primeros 2 km.", time: "06:10" },
      { id: "m2", from: "athlete", text: "Va. ¿Uso la misma carga del sled que la semana pasada?", time: "06:32" },
      { id: "m3", from: "athlete", text: "Me sentí con buenas piernas ayer.", time: "06:33" },
    ],
  },
  {
    id: "conv-2",
    athleteId: "ath-3",
    athleteName: "Luis A.",
    unread: 1,
    messages: [
      { id: "m1", from: "athlete", text: "Tengo una molestia ligera en la rodilla izquierda.", time: "Ayer" },
    ],
  },
  {
    id: "conv-3",
    athleteId: "ath-2",
    athleteName: "Daniela R.",
    unread: 0,
    messages: [
      { id: "m1", from: "athlete", text: "Gracias por ajustar los wall balls.", time: "Lun" },
      { id: "m2", from: "coach", text: "Con gusto. El viernes repetimos el bloque.", time: "Lun" },
    ],
  },
];

export const mockCoachProgress = {
  completedSessions: { done: 38, planned: 45 },
  adherence: 84,
  bestTime: { label: "Simulación HYROX completa", value: "1:04:52", athlete: "Jorge M." },
  bestLoad: { label: "Sled Push 4 × 12.5 m", value: "232 kg", athlete: "Sofía T." },
};
