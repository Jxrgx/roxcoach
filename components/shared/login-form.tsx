"use client";

import { useState, useTransition, type FormEvent } from "react";
import { useSearchParams } from "next/navigation";
import { AlertTriangle } from "lucide-react";
import { signIn } from "@/lib/auth/actions";
import { LOGIN_ERROR_MESSAGES } from "@/lib/auth/errors";
import { hasErrors, validateLogin, type FieldErrors, type LoginInput } from "@/lib/validations";
import { Input } from "@/components/ui/field";
import { Button } from "@/components/ui/button";

export function LoginForm() {
  const params = useSearchParams();
  const urlError = params.get("error");
  const [values, setValues] = useState<LoginInput>({ email: "", password: "" });
  const [errors, setErrors] = useState<FieldErrors<keyof LoginInput>>({});
  const [message, setMessage] = useState<string | null>(urlError ? (LOGIN_ERROR_MESSAGES[urlError] ?? null) : null);
  const [pending, startTransition] = useTransition();

  function submit(e: FormEvent) {
    e.preventDefault();
    const found = validateLogin(values);
    setErrors(found);
    if (hasErrors(found)) return;
    setMessage(null);
    startTransition(async () => {
      // Si las credenciales son válidas, la acción redirige y no regresa.
      const result = await signIn({ ...values, next: params.get("next") ?? undefined });
      if (result.fieldErrors) setErrors(result.fieldErrors);
      if (result.message) setMessage(result.message);
    });
  }

  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-4">
      {message && (
        <p role="alert" className="flex items-start gap-2 rounded-xl border border-danger/40 bg-danger/10 px-3 py-2.5 text-sm text-ink">
          <AlertTriangle aria-hidden className="mt-0.5 size-4 shrink-0 text-danger" />
          {message}
        </p>
      )}
      <Input
        label="Correo"
        type="email"
        inputMode="email"
        autoComplete="email"
        value={values.email}
        onChange={(e) => setValues((v) => ({ ...v, email: e.target.value }))}
        error={errors.email}
      />
      <Input
        label="Contraseña"
        type="password"
        autoComplete="current-password"
        value={values.password}
        onChange={(e) => setValues((v) => ({ ...v, password: e.target.value }))}
        error={errors.password}
      />
      <Button type="submit" size="lg" fullWidth loading={pending} loadingLabel="Entrando…" className="mt-2">
        Iniciar sesión
      </Button>
    </form>
  );
}
