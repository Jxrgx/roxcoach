import type { MetadataRoute } from "next";

/**
 * Manifest PWA. Sin service worker por decisión (fase 11): la ejecución resiste
 * cortes de conexión con una cola local en IndexedDB (ver docs/architecture.md),
 * sin cachear HTML privado.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "RoxCoach",
    short_name: "RoxCoach",
    description: "Entrenamientos HYROX para coaches y atletas.",
    lang: "es-MX",
    start_url: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#0b0d0f",
    theme_color: "#0b0d0f",
    icons: [{ src: "/icons/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" }],
  };
}
