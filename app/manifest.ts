import type { MetadataRoute } from "next";

/** Manifest PWA. El service worker y el modo offline llegarán en una fase posterior. */
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
