"use client";

import { useFormStatus } from "react-dom";
import { LogOut } from "lucide-react";
import { signOut } from "@/lib/auth/actions";
import { Button, type ButtonVariant } from "@/components/ui/button";

function Submit({ variant, className }: { variant: ButtonVariant; className?: string }) {
  const { pending } = useFormStatus();
  return (
    <Button
      type="submit"
      variant={variant}
      loading={pending}
      loadingLabel="Cerrando sesión…"
      icon={<LogOut aria-hidden className="size-4" />}
      className={className}
    >
      Cerrar sesión
    </Button>
  );
}

/** Cierra la sesión con una Server Action (POST), no con un enlace GET. */
export function SignOutButton({ variant = "secondary", className }: { variant?: ButtonVariant; className?: string }) {
  return (
    <form action={signOut}>
      <Submit variant={variant} className={className} />
    </form>
  );
}
