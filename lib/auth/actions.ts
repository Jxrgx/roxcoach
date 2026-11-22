"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { requestOrigin } from "@/lib/http/origin";
import { authErrorMessage } from "@/lib/auth/errors";
import { isRole, safeNextPath } from "@/lib/permissions";
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

function isInternalPath(path: unknown): path is string {
  return typeof path === "string" && path.startsWith("/") && !path.startsWith("//") && !path.includes("\\");
}

export type SignUpResult =
  | { ok: false; message?: string; fieldErrors?: FieldErrors<keyof RegisterInput> }
  | { ok: true; status: "check-email"; email: string };

export async function signUp(input: RegisterInput & { next?: string }): Promise<SignUpResult> {
  const fieldErrors = validateRegister(input);
  if (hasErrors(fieldErrors)) return { ok: false, fieldErrors };
  if (!isRole(input.role)) return { ok: false, fieldErrors: { role: "Elige si eres coach o atleta." } };

  const supabase = await createClient();
  const email = input.email.trim();
  const { data, error } = await supabase.auth.signUp({
    email,
    password: input.password,
    options: {
      // `next` (p. ej. la invitación) se valida de nuevo en /auth/confirm con safeNextPath.
      emailRedirectTo: `${await requestOrigin()}/auth/confirm${isInternalPath(input.next) ? `?next=${encodeURIComponent(input.next)}` : ""}`,
      // El trigger de registro copia el rol a app_metadata y crea el perfil.
      data: { name: input.name.trim(), role: input.role },
    },
  });
  if (error) return { ok: false, message: authErrorMessage(error.code) };

  // Si la confirmación de correo estuviera desactivada, ya hay sesión.
  if (data.session) redirect(safeNextPath(input.next, input.role));

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
