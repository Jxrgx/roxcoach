import "server-only";
import { db } from "@/lib/db/prisma";
import { Prisma } from "@/lib/generated/prisma/client";
import { canSendMessages, THREAD_PAGE_SIZE, type MessageRelationStatus } from "@/lib/messages/rules";

/**
 * Mensajes uno a uno atleta–coach (fase 16). La conversación es el par
 * (coach, atleta) y solo existe si hay una relación entre ellos (coach_athletes,
 * en cualquier estado): sin relación, la conversación "no existe".
 *
 * - El coach ve las conversaciones con SUS atletas (id del atleta en la URL,
 *   siempre verificado contra su coachId).
 * - El atleta solo ve la de su coach actual (activo o en pausa) o, si ya no
 *   tiene, la del último coach con el que tuvo relación. Su coach se resuelve
 *   aquí: nunca llega del cliente.
 * - Escribir exige relación ACTIVA (aquí y en el trigger messages_check).
 */

export type Viewer = { role: "coach" | "athlete"; id: string };

interface Pair {
  coachId: string;
  athleteId: string;
  status: MessageRelationStatus;
  counterpartName: string;
}

export interface MessageDTO {
  id: string;
  clientId: string;
  mine: boolean;
  body: string;
  createdAt: string;
  readAt: string | null;
}

export interface ThreadDTO {
  athleteId: string;
  counterpartName: string;
  status: MessageRelationStatus;
  canSend: boolean;
  messages: MessageDTO[];
}

export interface ConversationSummaryDTO {
  athleteId: string;
  name: string;
  status: MessageRelationStatus;
  unread: number;
  last: { body: string; mine: boolean; createdAt: string } | null;
}

const senderOf = (viewer: Viewer) => (viewer.role === "coach" ? "coach" : "athlete");
const otherSender = (viewer: Viewer) => (viewer.role === "coach" ? "athlete" : "coach");

async function coachPair(coachId: string, athleteId: string): Promise<Pair | null> {
  const r = await db().coachAthlete.findUnique({
    where: { coachId_athleteId: { coachId, athleteId } },
    select: { status: true, athlete: { select: { profile: { select: { name: true } } } } },
  });
  if (!r?.athlete?.profile) return null;
  return { coachId, athleteId, status: r.status, counterpartName: r.athlete.profile.name };
}

async function athletePair(athleteId: string): Promise<Pair | null> {
  const select = { coachId: true, status: true, coach: { select: { profile: { select: { name: true } } } } } as const;
  const r =
    (await db().coachAthlete.findFirst({ where: { athleteId, status: { in: ["active", "paused"] } }, select })) ??
    (await db().coachAthlete.findFirst({ where: { athleteId, status: "removed" }, orderBy: { removedAt: "desc" }, select }));
  if (!r?.coach?.profile) return null;
  return { coachId: r.coachId, athleteId, status: r.status, counterpartName: r.coach.profile.name };
}

/** Par visible para quien mira. `athleteId` solo lo usa el coach; el atleta siempre se ve a sí mismo. */
function resolvePair(viewer: Viewer, athleteId: string | null): Promise<Pair | null> {
  if (viewer.role === "athlete") return athletePair(viewer.id);
  return athleteId ? coachPair(viewer.id, athleteId) : Promise.resolve(null);
}

function toDTO(viewer: Viewer, m: { id: string; clientId: string; sender: "coach" | "athlete"; body: string; createdAt: Date; readAt: Date | null }): MessageDTO {
  return {
    id: m.id,
    clientId: m.clientId,
    mine: m.sender === senderOf(viewer),
    body: m.body,
    createdAt: m.createdAt.toISOString(),
    readAt: m.readAt?.toISOString() ?? null,
  };
}

const MESSAGE_SELECT = { id: true, clientId: true, sender: true, body: true, createdAt: true, readAt: true } as const;

/** Hilo (los THREAD_PAGE_SIZE mensajes más recientes, en orden cronológico) o null si no hay acceso. */
export async function loadThread(viewer: Viewer, athleteId: string | null): Promise<ThreadDTO | null> {
  const pair = await resolvePair(viewer, athleteId);
  if (!pair) return null;
  const rows = await db().message.findMany({
    where: { coachId: pair.coachId, athleteId: pair.athleteId },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: THREAD_PAGE_SIZE,
    select: MESSAGE_SELECT,
  });
  return {
    athleteId: pair.athleteId,
    counterpartName: pair.counterpartName,
    status: pair.status,
    canSend: canSendMessages(pair.status),
    messages: rows.reverse().map((m) => toDTO(viewer, m)),
  };
}

/**
 * Conversaciones del coach: atletas actuales (activos y en pausa, aunque aún no
 * haya mensajes, para poder escribirles) y anteriores solo si tienen historial.
 * Primero las que tienen mensajes, por el más reciente.
 */
export async function listCoachConversations(coachId: string): Promise<ConversationSummaryDTO[]> {
  const [relations, unread] = await Promise.all([
    db().coachAthlete.findMany({
      where: {
        coachId,
        OR: [{ status: { in: ["active", "paused"] } }, { status: "removed", athlete: { messages: { some: { coachId } } } }],
      },
      select: {
        athleteId: true,
        status: true,
        athlete: {
          select: {
            profile: { select: { name: true } },
            messages: { where: { coachId }, orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: 1, select: { sender: true, body: true, createdAt: true } },
          },
        },
      },
    }),
    db().message.groupBy({ by: ["athleteId"], where: { coachId, sender: "athlete", readAt: null }, _count: { _all: true } }),
  ]);
  const unreadBy = new Map(unread.map((u) => [u.athleteId, u._count._all]));
  const list = relations.flatMap((r): ConversationSummaryDTO[] => {
    if (!r.athlete?.profile) return [];
    const last = r.athlete.messages[0];
    return [
      {
        athleteId: r.athleteId,
        name: r.athlete.profile.name,
        status: r.status,
        unread: unreadBy.get(r.athleteId) ?? 0,
        last: last ? { body: last.body, mine: last.sender === "coach", createdAt: last.createdAt.toISOString() } : null,
      },
    ];
  });
  return list.sort((a, b) => {
    if (a.last && b.last) return b.last.createdAt.localeCompare(a.last.createdAt);
    if (a.last || b.last) return a.last ? -1 : 1;
    return a.name.localeCompare(b.name, "es");
  });
}

/** No leídos del atleta (solo de la conversación que puede ver). */
export async function countUnreadForAthlete(athleteId: string): Promise<number> {
  const pair = await athletePair(athleteId);
  if (!pair) return 0;
  return db().message.count({ where: { coachId: pair.coachId, athleteId, sender: "coach", readAt: null } });
}

/** No leídos del coach (de atletas con los que tiene o tuvo relación). */
export async function countUnreadForCoach(coachId: string): Promise<number> {
  return db().message.count({ where: { coachId, sender: "athlete", readAt: null, athlete: { coaches: { some: { coachId } } } } });
}

/** Marca como leídos los mensajes que recibió quien mira. Devuelve cuántos cambió. */
export async function markThreadRead(viewer: Viewer, athleteId: string | null): Promise<number | null> {
  const pair = await resolvePair(viewer, athleteId);
  if (!pair) return null;
  const res = await db().message.updateMany({
    where: { coachId: pair.coachId, athleteId: pair.athleteId, sender: otherSender(viewer), readAt: null },
    data: { readAt: new Date() },
  });
  return res.count;
}

export type SendResult =
  | { ok: true; message: MessageDTO; athleteId: string }
  | { ok: false; reason: "not-found" | "read-only" | "conflict" };

/**
 * Envía un mensaje. Idempotente por `clientId` (lo genera el dispositivo): un
 * reintento devuelve el mismo mensaje. Un clientId que ya usó otro par o el
 * otro participante se rechaza sin revelar nada.
 */
export async function sendMessage(viewer: Viewer, athleteId: string | null, input: { clientId: string; body: string }): Promise<SendResult> {
  const pair = await resolvePair(viewer, athleteId);
  if (!pair) return { ok: false, reason: "not-found" };
  const sender = senderOf(viewer);
  const sameAuthor = (m: { coachId: string; athleteId: string; sender: "coach" | "athlete" }) =>
    m.coachId === pair.coachId && m.athleteId === pair.athleteId && m.sender === sender;

  const existing = await db().message.findUnique({ where: { clientId: input.clientId }, select: { ...MESSAGE_SELECT, coachId: true, athleteId: true } });
  if (existing) return sameAuthor(existing) ? { ok: true, message: toDTO(viewer, existing), athleteId: pair.athleteId } : { ok: false, reason: "conflict" };

  if (!canSendMessages(pair.status)) return { ok: false, reason: "read-only" };
  try {
    const created = await db().message.create({
      data: { coachId: pair.coachId, athleteId: pair.athleteId, sender, body: input.body, clientId: input.clientId },
      select: MESSAGE_SELECT,
    });
    return { ok: true, message: toDTO(viewer, created), athleteId: pair.athleteId };
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      // Dos envíos simultáneos con el mismo clientId: el otro ganó.
      const winner = await db().message.findUnique({ where: { clientId: input.clientId }, select: { ...MESSAGE_SELECT, coachId: true, athleteId: true } });
      if (winner && sameAuthor(winner)) return { ok: true, message: toDTO(viewer, winner), athleteId: pair.athleteId };
      return { ok: false, reason: "conflict" };
    }
    // La relación pudo pausarse entre la lectura y la escritura (el trigger lo rechaza).
    const now = await resolvePair(viewer, athleteId);
    if (!now || !canSendMessages(now.status)) return { ok: false, reason: "read-only" };
    throw error;
  }
}
