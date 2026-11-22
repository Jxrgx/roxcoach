/** Catálogos del reporte de molestia (los valores coinciden con los enums de la BD). */

export const DISCOMFORT_ZONES = [
  "cuello",
  "hombro",
  "codo_muneca",
  "espalda_alta",
  "espalda_baja",
  "cadera",
  "muslo",
  "rodilla",
  "pantorrilla",
  "tobillo_pie",
  "otra",
] as const;
export type DiscomfortZoneValue = (typeof DISCOMFORT_ZONES)[number];

export const DISCOMFORT_ZONE_LABEL: Record<DiscomfortZoneValue, string> = {
  cuello: "Cuello",
  hombro: "Hombro",
  codo_muneca: "Codo o muñeca",
  espalda_alta: "Espalda alta",
  espalda_baja: "Espalda baja",
  cadera: "Cadera",
  muslo: "Muslo",
  rodilla: "Rodilla",
  pantorrilla: "Pantorrilla",
  tobillo_pie: "Tobillo o pie",
  otra: "Otra zona",
};

export const DISCOMFORT_INTENSITIES = ["leve", "moderada", "fuerte"] as const;
export type DiscomfortIntensityValue = (typeof DISCOMFORT_INTENSITIES)[number];

export const DISCOMFORT_INTENSITY_LABEL: Record<DiscomfortIntensityValue, string> = {
  leve: "Leve",
  moderada: "Moderada",
  fuerte: "Fuerte",
};
