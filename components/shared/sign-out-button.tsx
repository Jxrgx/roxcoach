"use client";

import { useRef, useState, type FormEvent } from "react";
import { useFormStatus } from "react-dom";
import { LogOut } from "lucide-react";
import { signOut } from "@/lib/auth/actions";
import { openExecutionStore } from "@/lib/offline/idb";
import { Button, type ButtonVariant } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";

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

/**
 * Cierra la sesión con una Server Action (POST), no con un enlace GET.
 * Con `userId` (atleta, fase 12): antes de salir borra los datos privados de ese
 * usuario guardados en el dispositivo (copia de la ejecución, cola y descanso).
 * Si quedan registros sin enviar, avisa antes de borrarlos.
 */
export function SignOutButton({ variant = "secondary", className, userId }: { variant?: ButtonVariant; className?: string; userId?: string }) {
  const formRef = useRef<HTMLFormElement>(null);
  const cleared = useRef(false);
  const [pendingCount, setPendingCount] = useState(0);
  const [confirmOpen, setConfirmOpen] = useState(false);

  async function clearAndSubmit() {
    if (userId) {
      const store = await openExecutionStore();
      await store.clearUser(userId);
    }
    cleared.current = true;
    formRef.current?.requestSubmit();
  }

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    if (!userId || cleared.current) return; // ya limpio: el formulario sigue su curso
    e.preventDefault();
    const store = await openExecutionStore();
    const count = await store.countPending(userId);
    if (count > 0) {
      setPendingCount(count);
      setConfirmOpen(true);
      return;
    }
    await clearAndSubmit();
  }

  return (
    <>
      <form ref={formRef} action={signOut} onSubmit={(e) => void onSubmit(e)}>
        <Submit variant={variant} className={className} />
      </form>
      <ConfirmDialog
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        onConfirm={() => {
          setConfirmOpen(false);
          void clearAndSubmit();
        }}
        title="¿Cerrar sesión con registros sin enviar?"
        description={`Tienes ${pendingCount} ${pendingCount === 1 ? "registro" : "registros"} de tu entrenamiento sin enviar en este dispositivo. Si cierras sesión se borrarán. Conéctate y espera a que se sincronicen para conservarlos.`}
        confirmLabel="Cerrar sesión y borrar"
        cancelLabel="Volver"
      />
    </>
  );
}
