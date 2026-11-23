import type { MetadataRoute } from "next";

/**
 * Manifest PWA (fase 12): instalable en el teléfono, a pantalla completa y en
 * vertical. El service worker (public/sw.js) es mínimo: solo permite recargar
 * sin red la ejecución abierta (shell estático + IndexedDB) y muestra
 * /sin-conexion en otras rutas; nunca cachea HTML privado.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "RoxCoach",
    short_name: "RoxCoach",
    description: "Entrenamientos HYROX para coaches y atletas.",
    lang: "es-MX",
    dir: "ltr",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#0b0d0f",
    theme_color: "#0b0d0f",
    categories: ["sports", "health", "fitness"],
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
      { src: "/icons/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" },
    ],
  };
}
