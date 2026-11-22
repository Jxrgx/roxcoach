import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { LoadingState } from "@/components/ui/loading-state";
import { AuthLayout } from "@/components/shared/auth-layout";
import { RegisterForm } from "@/components/shared/register-form";

export const metadata: Metadata = { title: "Crear cuenta" };

export default function RegisterPage() {
  return (
    <AuthLayout
      title="Crea tu cuenta"
      description="Coaches programan y miden; atletas entrenan y registran."
      footer={
        <>
          ¿Ya tienes cuenta?{" "}
          <Link href="/login" className="inline-flex min-h-11 items-center font-medium text-electric hover:underline">
            Inicia sesión
          </Link>
        </>
      }
    >
      {/* RegisterForm lee ?rol y ?next de la URL. */}
      <Suspense fallback={<LoadingState label="Cargando…" rows={1} />}>
        <RegisterForm />
      </Suspense>
    </AuthLayout>
  );
}
