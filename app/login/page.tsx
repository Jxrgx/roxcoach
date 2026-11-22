import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { LoadingState } from "@/components/ui/loading-state";
import { AuthLayout } from "@/components/shared/auth-layout";
import { LoginForm } from "@/components/shared/login-form";

export const metadata: Metadata = { title: "Iniciar sesión" };

export default function LoginPage() {
  return (
    <AuthLayout
      title="Inicia sesión"
      description="Entra para ver tus sesiones y tu equipo."
      footer={
        <>
          ¿No tienes cuenta?{" "}
          <Link href="/registro" className="inline-flex min-h-11 items-center font-medium text-electric hover:underline">
            Crea una
          </Link>
        </>
      }
    >
      {/* LoginForm lee ?next y ?error de la URL. */}
      <Suspense fallback={<LoadingState label="Cargando…" rows={1} />}>
        <LoginForm />
      </Suspense>
    </AuthLayout>
  );
}
