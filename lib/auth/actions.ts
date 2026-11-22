"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { authErrorMessage } from "@/lib/auth/errors";
import { isRole, ROLE_HOME, safeNextPath } from "@/lib/permissions";
import { hasErrors, validateLogin, validateRegister, type FieldErrors, type LoginInput, type RegisterInput } from "@/lib/validations";

/**
 * Server Actions de autenticación. Repiten la validación del cliente
 * (CLAUDE.md: validar en cliente y de nuevo en servidor).
 */

export type SignInResult = { ok: false; message?: string; fieldErrors?: FieldErrors<keyof LoginInput> };

export async function signIn(input: LoginInput & { next?: string }): Promise<SignInResult> {
  const fieldErrors = validateLogin(input);
  if (hasErrors(fieldErrors)) return { ok: false, fieldErrors };

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithPassword({
    email: input.email.trim(),
    password: input.password,
  });
  if (error) return { ok: false, message: authErrorMessage(error.code) };

  const role = data.user?.app_metadata?.role;
  if (!isRole(role)) {
    await supabase.auth.signOut();
    return { ok: false, message: "Tu cuenta no tiene un rol asignado. Contacta al soporte." };
  }

  redirect(safeNextPath(input.next, role));
}

export type SignUpResult =
  | { ok: false; message?: string; fieldErrors?: FieldErrors<keyof RegisterInput> }
  | { ok: true; status: "check-email"; email: string };

async function requestOrigin(): Promise<string> {
  const h = await headers();
  const origin = h.get("origin");
  if (origin) return origin;
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  return `${proto}://${host}`;
}

export async function signUp(input: RegisterInput): Promise<SignUpResult> {
  const fieldErrors = validateRegister(input);
  if (hasErrors(fieldErrors)) return { ok: false, fieldErrors };
  if (!isRole(input.role)) return { ok: false, fieldErrors: { role: "Elige si eres coach o atleta." } };

  const supabase = await createClient();
  const email = input.email.trim();
  const { data, error } = await supabase.auth.signUp({
    email,
    password: input.password,
    options: {
      emailRedirectTo: `${await requestOrigin()}/auth/confirm`,
      // El trigger de registro copia el rol a app_metadata y crea el perfil.
      data: { name: input.name.trim(), role: input.role },
    },
  });
  if (error) return { ok: false, message: authErrorMessage(error.code) };

  // Si la confirmación de correo estuviera desactivada, ya hay sesión.
  if (data.session) redirect(ROLE_HOME[input.role]);

  // Con confirmación obligatoria (o correo ya registrado) se muestra el mismo
  // mensaje, para no revelar qué correos tienen cuenta.
  return { ok: true, status: "check-email", email };
}

/** Cierra la sesión solo en este dispositivo (no en los demás del usuario). */
export async function signOut(): Promise<void> {
  const supabase = await createClient();
  await supabase.auth.signOut({ scope: "local" });
  redirect("/login");
}
