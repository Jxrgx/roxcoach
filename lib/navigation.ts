/**
 * Rutas de navegación centralizadas. Los iconos se asignan en los componentes
 * de shell para mantener este módulo libre de dependencias de UI.
 */

export interface NavItem {
  key: string;
  label: string;
  href: string;
}

export const COACH_NAV: NavItem[] = [
  { key: "inicio", label: "Inicio", href: "/coach/inicio" },
  { key: "calendario", label: "Calendario", href: "/coach/calendario" },
  { key: "atletas", label: "Atletas", href: "/coach/atletas" },
  { key: "entrenamientos", label: "Entrenamientos", href: "/coach/entrenamientos" },
  { key: "biblioteca", label: "Biblioteca", href: "/coach/biblioteca" },
  { key: "progreso", label: "Progreso", href: "/coach/progreso" },
  { key: "mensajes", label: "Mensajes", href: "/coach/mensajes" },
  { key: "configuracion", label: "Configuración", href: "/coach/configuracion" },
];

/**
 * Secciones esenciales visibles en la barra inferior móvil del coach, según la
 * prioridad del coach: sesiones del día, programar, atletas, resultados.
 * El resto vive en "Más".
 */
export const COACH_PRIMARY_MOBILE = ["inicio", "calendario", "atletas", "progreso"];

export const ATHLETE_NAV: NavItem[] = [
  { key: "inicio", label: "Inicio", href: "/atleta/inicio" },
  { key: "agenda", label: "Agenda", href: "/atleta/agenda" },
  { key: "sesiones", label: "Entrenamiento", href: "/atleta/sesiones" },
  { key: "progreso", label: "Progreso", href: "/atleta/progreso" },
  { key: "perfil", label: "Perfil", href: "/atleta/perfil" },
];

export function isActive(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}
