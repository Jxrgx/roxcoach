/**
 * Traduce códigos de error de Supabase Auth a mensajes claros en español.
 * Nunca revela si un correo existe (evita enumeración de cuentas).
 */
export function authErrorMessage(code: string | undefined): string {
  switch (code) {
    case "invalid_credentials":
      return "Correo o contraseña incorrectos.";
    case "email_not_confirmed":
      return "Confirma tu correo antes de entrar. Revisa tu bandeja de entrada.";
    case "email_address_invalid":
      return "No podemos usar ese correo. Revisa que esté bien escrito y que sea una dirección real.";
    case "weak_password":
      return "La contraseña es muy débil. Usa al menos 8 caracteres combinando letras y números.";
    case "over_email_send_rate_limit":
    case "over_request_rate_limit":
      return "Demasiados intentos. Espera unos minutos e inténtalo de nuevo.";
    case "signup_disabled":
      return "El registro está deshabilitado temporalmente.";
    case "user_banned":
      return "Esta cuenta está suspendida. Contacta a tu coach o al soporte.";
    default:
      return "No pudimos completar la operación. Inténtalo de nuevo.";
  }
}

/** Mensajes para `/login?error=…`. */
export const LOGIN_ERROR_MESSAGES: Record<string, string> = {
  perfil: "Tu cuenta no tiene un perfil válido. Vuelve a iniciar sesión o contacta al soporte.",
  // El enlace PKCE solo inicia sesión en el navegador donde se hizo el registro.
  // Si se abrió en otro, la cuenta sí queda confirmada: por eso se invita a entrar.
  confirmacion:
    "No pudimos iniciar tu sesión con ese enlace. Si ya confirmaste tu correo, inicia sesión aquí; si el enlace expiró, regístrate de nuevo.",
};
