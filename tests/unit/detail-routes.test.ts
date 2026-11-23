import { describe, expect, it } from "vitest";
import { isDocumentRequest, isUuid, matchDetailRoute } from "@/lib/http/detail-routes";

const ID = "11111111-1111-4111-8111-111111111111";
const ID2 = "22222222-2222-4222-8222-222222222222";
const h = (entries: Record<string, string>) => new Headers(entries);

describe("rutas de detalle para el 404 real del proxy", () => {
  it("reconoce cada detalle con su rol y sus ids", () => {
    expect(matchDetailRoute(`/coach/atletas/${ID}`)).toEqual({ kind: "coach-atleta", role: "coach", ids: [ID] });
    expect(matchDetailRoute(`/coach/progreso/${ID}`)?.kind).toBe("coach-progreso-atleta");
    expect(matchDetailRoute(`/coach/biblioteca/${ID}`)?.kind).toBe("coach-ejercicio");
    expect(matchDetailRoute(`/coach/biblioteca/${ID}/editar`)?.kind).toBe("coach-ejercicio-editar");
    expect(matchDetailRoute(`/coach/entrenamientos/${ID}`)?.kind).toBe("coach-plantilla");
    expect(matchDetailRoute(`/coach/entrenamientos/${ID}/editar`)?.kind).toBe("coach-plantilla-editar");
    expect(matchDetailRoute(`/coach/sesiones/${ID}`)?.kind).toBe("coach-sesion");
    expect(matchDetailRoute(`/coach/sesiones/${ID}/atletas/${ID2}`)).toEqual({ kind: "coach-sesion-atleta", role: "coach", ids: [ID, ID2] });
    expect(matchDetailRoute(`/coach/sesiones/${ID}/atletas/${ID2}/personalizar`)?.kind).toBe("coach-sesion-atleta");
    expect(matchDetailRoute(`/atleta/sesiones/${ID}`)).toEqual({ kind: "atleta-sesion", role: "athlete", ids: [ID] });
    expect(matchDetailRoute(`/atleta/sesiones/${ID}/ejecutar`)?.kind).toBe("atleta-ejecucion");
    expect(matchDetailRoute(`/atleta/sesiones/${ID}/resumen`)?.kind).toBe("atleta-ejecucion");
    expect(matchDetailRoute(`/atleta/ejercicios/${ID}`)?.kind).toBe("atleta-ejercicio");
  });

  it("no confunde rutas estáticas ni listas con detalles", () => {
    for (const p of ["/coach/biblioteca/nuevo", "/coach/entrenamientos/nueva", "/coach/sesiones/nueva", "/coach/atletas", "/coach/inicio", "/atleta/sesiones", "/atleta/perfil", `/coach/atletas/${ID}/otra`]) {
      expect(matchDetailRoute(p), p).toBeNull();
    }
  });

  it("los ids mal formados se detectan sin consultar la base de datos", () => {
    expect(isUuid(ID)).toBe(true);
    expect(isUuid("no-es-un-id")).toBe(false);
    expect(matchDetailRoute("/coach/sesiones/no-es-un-id")?.ids.every(isUuid)).toBe(false);
  });

  it("solo las cargas de documento pasan por la comprobación (nunca RSC ni prefetch)", () => {
    expect(isDocumentRequest("GET", h({ "sec-fetch-dest": "document", accept: "text/html" }))).toBe(true);
    expect(isDocumentRequest("GET", h({ accept: "text/html,application/xhtml+xml" }))).toBe(true);
    expect(isDocumentRequest("GET", h({ rsc: "1", accept: "*/*" }))).toBe(false);
    expect(isDocumentRequest("GET", h({ "next-router-prefetch": "1", accept: "text/html" }))).toBe(false);
    expect(isDocumentRequest("GET", h({ "next-router-segment-prefetch": "/_tree" }))).toBe(false);
    // El service worker reenvía la navegación: "empty" pero con Accept HTML (o modo navigate).
    expect(isDocumentRequest("GET", h({ "sec-fetch-dest": "empty", accept: "text/html,application/xhtml+xml" }))).toBe(true);
    expect(isDocumentRequest("GET", h({ "sec-fetch-mode": "navigate", "sec-fetch-dest": "empty" }))).toBe(true);
    // fetch() comunes, imágenes o scripts: nunca.
    expect(isDocumentRequest("GET", h({ "sec-fetch-dest": "empty", accept: "*/*" }))).toBe(false);
    expect(isDocumentRequest("GET", h({ "sec-fetch-dest": "image", accept: "text/html" }))).toBe(false);
    expect(isDocumentRequest("GET", h({ "sec-fetch-dest": "script" }))).toBe(false);
    expect(isDocumentRequest("POST", h({ "sec-fetch-dest": "document" }))).toBe(false);
  });
});
