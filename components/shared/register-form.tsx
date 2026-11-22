"use client";

import { useState, useTransition, type FormEvent } from "react";
import { AlertTriangle, MailCheck } from "lucide-react";
import { signUp } from "@/lib/auth/actions";
import { hasErrors, validateRegister, type FieldErrors, type RegisterInput } from "@/lib/validations";
import { Input } from "@/components/ui/field";
import { Button } from "@/components/ui/button";

export function RegisterForm() {
  const [values, setValues] = useState<RegisterInput>({ name: "", email: "", password: "", role: "" });
  const [errors, setErrors] = useState<FieldErrors<keyof RegisterInput>>({});
  const [message, setMessage] = useState<string | null>(null);
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const set = (key: keyof RegisterInput) => (v: string) => setValues((prev) => ({ ...prev, [key]: v }));

  function submit(e: FormEvent) {
    e.preventDefault();
    const found = validateRegister(values);
    setErrors(found);
    if (hasErrors(found)) return;
    setMessage(null);
    startTransition(async () => {
      const result = await signUp(values);
      if (result.ok) {
        setSentTo(result.email);
        return;
      }
      if (result.fieldErrors) setErrors(result.fieldErrors);
      if (result.message) setMessage(result.message);
    });
  }

  if (sentTo) {
    return (
      <div role="status" className="rounded-2xl border border-line bg-surface p-5 text-center">
        <MailCheck aria-hidden className="mx-auto size-8 text-positive" />
        <h2 className="mt-3 text-lg font-semibold text-ink">Revisa tu correo</h2>
        <p className="mt-1.5 text-sm text-muted">
          Si <strong className="text-ink">{sentTo}</strong> no tenía cuenta, te enviamos un enlace para confirmarla. Ábrelo
          desde este dispositivo para entrar.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-4">
      {message && (
        <p role="alert" className="flex items-start gap-2 rounded-xl border border-danger/40 bg-danger/10 px-3 py-2.5 text-sm text-ink">
          <AlertTriangle aria-hidden className="mt-0.5 size-4 shrink-0 text-danger" />
          {message}
        </p>
      )}
      <fieldset aria-describedby={errors.role ? "role-error" : undefined}>
        <legend className="text-sm font-medium text-ink">Soy</legend>
        <div className="mt-2 grid grid-cols-2 gap-2">
          {[
            { value: "coach", label: "Coach" },
            { value: "athlete", label: "Atleta" },
          ].map((r) => (
            <label key={r.value} className="relative">
              <input
                type="radio"
                name="role"
                value={r.value}
                checked={values.role === r.value}
                onChange={() => set("role")(r.value)}
                className="peer sr-only"
              />
              <span className="flex min-h-12 cursor-pointer items-center justify-center rounded-xl border border-line bg-surface text-sm text-muted peer-checked:border-electric peer-checked:bg-electric/15 peer-checked:font-semibold peer-checked:text-ink peer-focus-visible:outline-2 peer-focus-visible:outline-electric">
                {r.label}
              </span>
            </label>
          ))}
        </div>
        {errors.role && (
          <p id="role-error" role="alert" className="mt-1.5 text-sm text-danger">
            {errors.role}
          </p>
        )}
      </fieldset>
      <Input label="Nombre" autoComplete="name" value={values.name} onChange={(e) => set("name")(e.target.value)} error={errors.name} />
      <Input
        label="Correo"
        type="email"
        inputMode="email"
        autoComplete="email"
        value={values.email}
        onChange={(e) => set("email")(e.target.value)}
        error={errors.email}
      />
      <Input
        label="Contraseña"
        type="password"
        autoComplete="new-password"
        hint="Mínimo 8 caracteres."
        value={values.password}
        onChange={(e) => set("password")(e.target.value)}
        error={errors.password}
      />
      <Button type="submit" size="lg" fullWidth loading={pending} loadingLabel="Creando cuenta…" className="mt-2">
        Crear cuenta
      </Button>
    </form>
  );
}
