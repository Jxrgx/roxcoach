import { AthleteShell } from "@/components/athlete/athlete-shell";

/** Shell del atleta para los 404 reales de detalles (sin gate: el proxy ya verificó la sesión y el rol). */
export default function AthleteNotFoundLayout({ children }: LayoutProps<"/no-encontrado/atleta">) {
  return <AthleteShell>{children}</AthleteShell>;
}
