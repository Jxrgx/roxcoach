import { normalizeSearch } from "@/lib/utils/format";

/**
 * Lista de atletas del coach: tipos y filtros puros (sin dependencias de UI
 * ni de servidor), usados por AthleteRoster y por las pruebas.
 */

export interface RosterItem {
  athleteId: string;
  name: string;
  email: string;
  division: string;
  status: "active" | "paused";
  /** Texto calculado en servidor: "En tu equipo desde 22 nov 2026". */
  joinedLabel: string;
}

export interface OpenInvitationItem {
  id: string;
  email: string;
  name: string;
  state: "pending" | "expired";
  /** Texto calculado en servidor: "Vence en 7 días" / "Venció…". */
  expiresLabel: string;
}

export type RosterFilter = "todos" | "active" | "paused" | "invitaciones";

/** Filtra por estado y por texto (nombre, correo o división, sin acentos). */
export function filterRoster(athletes: RosterItem[], query: string, filter: RosterFilter): RosterItem[] {
  if (filter === "invitaciones") return [];
  const q = normalizeSearch(query);
  return athletes.filter(
    (a) => (filter === "todos" || a.status === filter) && (q === "" || normalizeSearch(`${a.name} ${a.email} ${a.division}`).includes(q)),
  );
}

export function filterInvitations(invitations: OpenInvitationItem[], query: string): OpenInvitationItem[] {
  const q = normalizeSearch(query);
  return invitations.filter((i) => q === "" || normalizeSearch(`${i.name} ${i.email}`).includes(q));
}
