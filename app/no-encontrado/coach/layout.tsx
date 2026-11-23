import { CoachChrome } from "@/components/coach/coach-chrome";

/** Shell del coach para los 404 reales de detalles (sin gate: el proxy ya verificó la sesión y el rol). */
export default function CoachNotFoundLayout({ children }: LayoutProps<"/no-encontrado/coach">) {
  return <CoachChrome>{children}</CoachChrome>;
}
