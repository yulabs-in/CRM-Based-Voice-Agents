/** Supabase auth errors in plain words, plus whether the "resend confirmation" action applies. */
export function friendlyError(message: string): { text: string; unconfirmed?: boolean } {
  const m = message.toLowerCase();
  if (m.includes("invalid login credentials"))
    return { text: "That email and password don't match. Check them, or reset your password." };
  if (m.includes("email not confirmed"))
    return {
      text: "Please confirm your email first — we sent you a link when you signed up.",
      unconfirmed: true,
    };
  if (m.includes("already registered") || m.includes("already been registered"))
    return { text: "An account with this email already exists. Sign in instead." };
  if (m.includes("rate limit") || m.includes("too many"))
    return { text: "Too many attempts. Wait a minute and try again." };
  if (m.includes("password should be"))
    return { text: "Choose a longer password (at least 8 characters)." };
  return { text: message };
}
