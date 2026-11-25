import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  canSendMessages,
  formatMessageTime,
  MESSAGE_MAX_LENGTH,
  messagePreview,
  readOnlyReason,
  validateMessageBody,
} from "@/lib/messages/rules";
import { parseSendInput } from "@/lib/messages/actions-shared";
import type { ThreadDTO } from "@/lib/db/messages";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
const { MessageThread } = await import("@/components/messages/message-thread");

const TZ = "America/Mexico_City";
const UUID = "4b0f8f0e-9a43-4d0b-8a57-0f6c8a3f1f11";

describe("reglas de mensajes", () => {
  it("valida el texto: no vacío ni solo espacios, máximo 2000", () => {
    expect(validateMessageBody("")).toBe("Escribe un mensaje.");
    expect(validateMessageBody("   \n ")).toBe("Escribe un mensaje.");
    expect(validateMessageBody("Hola coach")).toBeUndefined();
    expect(validateMessageBody("a".repeat(MESSAGE_MAX_LENGTH))).toBeUndefined();
    expect(validateMessageBody("a".repeat(MESSAGE_MAX_LENGTH + 1))).toMatch(/máximo 2000/);
  });

  it("solo se escribe con relación activa; en pausa o terminada es solo lectura", () => {
    expect(canSendMessages("active")).toBe(true);
    expect(canSendMessages("paused")).toBe(false);
    expect(canSendMessages("removed")).toBe(false);
    expect(readOnlyReason("active", "athlete")).toBeNull();
    expect(readOnlyReason("paused", "athlete")).toMatch(/pausó tu plan/);
    expect(readOnlyReason("paused", "coach")).toMatch(/en pausa/);
    expect(readOnlyReason("removed", "coach")).toMatch(/ya no está en tu equipo/);
  });

  it("fecha relativa determinista en la zona de la app", () => {
    // 2026-11-25 16:05 UTC = 10:05 en Ciudad de México.
    expect(formatMessageTime("2026-11-25T16:05:00Z", "2026-11-25", TZ)).toBe("10:05");
    expect(formatMessageTime("2026-11-24T16:05:00Z", "2026-11-25", TZ)).toBe("Ayer · 10:05");
    expect(formatMessageTime("2026-11-20T16:05:00Z", "2026-11-25", TZ)).toMatch(/^20 nov · 10:05$/);
    expect(formatMessageTime("2025-11-20T16:05:00Z", "2026-11-25", TZ)).toMatch(/2025/);
    // 01:00 UTC del 25 todavía es el 24 en México.
    expect(formatMessageTime("2026-11-25T01:00:00Z", "2026-11-25", TZ)).toBe("Ayer · 19:00");
  });

  it("vista previa de una línea", () => {
    expect(messagePreview("Hola\n\ncoach")).toBe("Hola coach");
    expect(messagePreview("x".repeat(100))).toHaveLength(80);
  });

  it("la entrada del cliente se valida en servidor (forma, uuid y texto)", () => {
    expect(parseSendInput(null).ok).toBe(false);
    expect(parseSendInput({ clientId: "no-uuid", body: "Hola" }).ok).toBe(false);
    expect(parseSendInput({ clientId: UUID, body: 42 }).ok).toBe(false);
    expect(parseSendInput({ clientId: UUID, body: "  " })).toMatchObject({ ok: false, field: "body" });
    expect(parseSendInput({ clientId: UUID, body: "  Hola  " })).toEqual({ ok: true, value: { clientId: UUID, body: "Hola" } });
  });
});

const thread = (overrides: Partial<ThreadDTO> = {}): ThreadDTO => ({
  athleteId: UUID,
  counterpartName: "Coach Jorge",
  status: "active",
  canSend: true,
  messages: [
    { id: "m1", clientId: "c1", mine: false, body: "¿Cómo te sentiste?", createdAt: "2026-11-25T15:00:00Z", readAt: null },
    { id: "m2", clientId: "c2", mine: true, body: "Bien, con energía.", createdAt: "2026-11-25T15:10:00Z", readAt: "2026-11-25T15:11:00Z" },
  ],
  ...overrides,
});

function setOnline(value: boolean) {
  Object.defineProperty(window.navigator, "onLine", { configurable: true, get: () => value });
  window.dispatchEvent(new Event(value ? "online" : "offline"));
}

describe("MessageThread", () => {
  beforeEach(() => setOnline(true));
  afterEach(() => setOnline(true));

  it("muestra recibidos, enviados, hora y estado leído / no leído (texto, no solo color)", () => {
    render(<MessageThread thread={thread()} viewer="athlete" today="2026-11-25" onSend={vi.fn()} onMarkRead={vi.fn(async () => {})} />);
    expect(screen.getByText("¿Cómo te sentiste?")).toBeInTheDocument();
    expect(screen.getByText("Leído")).toBeInTheDocument();
    expect(screen.getByText(/Nuevo/)).toBeInTheDocument();
    expect(screen.getByText("09:00")).toBeInTheDocument();
  });

  it("marca como leídos los recibidos al verse", () => {
    const onMarkRead = vi.fn(async () => {});
    render(<MessageThread thread={thread()} viewer="athlete" today="2026-11-25" onSend={vi.fn()} onMarkRead={onMarkRead} />);
    expect(onMarkRead).toHaveBeenCalledTimes(1);
  });

  it("estado vacío", () => {
    render(<MessageThread thread={thread({ messages: [] })} viewer="coach" today="2026-11-25" onSend={vi.fn()} onMarkRead={vi.fn(async () => {})} />);
    expect(screen.getByText("Todavía no hay mensajes")).toBeInTheDocument();
  });

  it("sin conexión: avisa, no envía y conserva el texto", async () => {
    const onSend = vi.fn();
    render(<MessageThread thread={thread()} viewer="athlete" today="2026-11-25" onSend={onSend} onMarkRead={vi.fn(async () => {})} />);
    await userEvent.type(screen.getByLabelText("Mensaje para Coach Jorge"), "Tengo una duda");
    act(() => setOnline(false));
    expect(screen.getByText(/requiere conexión/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Enviar" })).toBeDisabled();
    expect(screen.getByLabelText("Mensaje para Coach Jorge")).toHaveValue("Tengo una duda");
    expect(onSend).not.toHaveBeenCalled();
  });

  it("si el envío falla, el texto sigue y el reintento reutiliza el mismo clientId", async () => {
    const onSend = vi
      .fn()
      .mockResolvedValueOnce({ ok: false, message: "No se pudo enviar. Revisa tu conexión; tu mensaje sigue aquí." })
      .mockImplementationOnce(async (input: { clientId: string; body: string }) => ({
        ok: true,
        message: { id: "m3", clientId: input.clientId, mine: true, body: input.body, createdAt: "2026-11-25T16:00:00Z", readAt: null },
      }));
    render(<MessageThread thread={thread()} viewer="athlete" today="2026-11-25" onSend={onSend} onMarkRead={vi.fn(async () => {})} />);
    const box = screen.getByLabelText("Mensaje para Coach Jorge");
    await userEvent.type(box, "Hola");
    await userEvent.click(screen.getByRole("button", { name: "Enviar" }));
    expect(await screen.findByText(/tu mensaje sigue aquí/)).toBeInTheDocument();
    expect(box).toHaveValue("Hola");
    await userEvent.click(screen.getByRole("button", { name: "Enviar" }));
    expect(onSend).toHaveBeenCalledTimes(2);
    expect(onSend.mock.calls[1]?.[0].clientId).toBe(onSend.mock.calls[0]?.[0].clientId);
    expect(box).toHaveValue("");
    expect(screen.getByText("Enviado")).toBeInTheDocument();
  });

  it("relación en pausa: historial visible, sin formulario", () => {
    render(<MessageThread thread={thread({ status: "paused", canSend: false })} viewer="athlete" today="2026-11-25" onSend={vi.fn()} onMarkRead={vi.fn(async () => {})} />);
    expect(screen.getByText("¿Cómo te sentiste?")).toBeInTheDocument();
    expect(screen.getByRole("note")).toHaveTextContent(/pausó tu plan/);
    expect(screen.queryByRole("button", { name: "Enviar" })).not.toBeInTheDocument();
  });
});
