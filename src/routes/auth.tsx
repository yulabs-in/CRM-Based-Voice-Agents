import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import { AlertCircle, ArrowLeft, BarChart3, CheckCircle2, Eye, EyeOff, Loader2, MailCheck, PhoneCall, Sparkles, Workflow } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { lovable } from "@/integrations/lovable";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Logo } from "@/components/app/Logo";
import { cn } from "@/lib/utils";

type Mode = "signin" | "signup" | "forgot";
type Search = { mode?: Mode; redirect?: string };

const safePath = (p?: string) => (p && p.startsWith("/") && !p.startsWith("//") ? p : "/dashboard");

export const Route = createFileRoute("/auth")({
  validateSearch: (s: Record<string, unknown>): Search => ({
    mode: s.mode === "signup" || s.mode === "forgot" ? s.mode : undefined,
    redirect: typeof s.redirect === "string" ? s.redirect : undefined,
  }),
  head: () => ({
    meta: [
      { title: "Sign in — Yulabs CRM" },
      { name: "description", content: "Sign in or create your Yulabs CRM workspace." },
      { property: "og:title", content: "Sign in — Yulabs CRM" },
      { property: "og:description", content: "Sign in or create your Yulabs CRM workspace." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AuthPage,
});

function GoogleIcon() {
  return (
    <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24"><path fill="#4285F4" d="M23.49 12.27c0-.79-.07-1.54-.19-2.27H12v4.51h6.47c-.29 1.48-1.14 2.73-2.4 3.58v3h3.86c2.26-2.09 3.56-5.17 3.56-8.82z"/><path fill="#34A853" d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.86-3c-1.08.72-2.45 1.16-4.07 1.16-3.13 0-5.78-2.11-6.73-4.96H1.29v3.09C3.26 21.3 7.31 24 12 24z"/><path fill="#FBBC05" d="M5.27 14.29c-.25-.72-.38-1.49-.38-2.29s.14-1.57.38-2.29V6.62H1.29C.47 8.24 0 10.06 0 12s.47 3.76 1.29 5.38l3.98-3.09z"/><path fill="#EA4335" d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.31 0 3.26 2.7 1.29 6.62l3.98 3.09c.95-2.85 3.6-4.96 6.73-4.96z"/></svg>
  );
}

/** Supabase auth errors in plain words, plus whether the "resend confirmation" action applies. */
function friendlyError(message: string): { text: string; unconfirmed?: boolean } {
  const m = message.toLowerCase();
  if (m.includes("invalid login credentials")) return { text: "That email and password don't match. Check them, or reset your password." };
  if (m.includes("email not confirmed")) return { text: "Please confirm your email first — we sent you a link when you signed up.", unconfirmed: true };
  if (m.includes("already registered") || m.includes("already been registered")) return { text: "An account with this email already exists. Sign in instead." };
  if (m.includes("rate limit") || m.includes("too many")) return { text: "Too many attempts. Wait a minute and try again." };
  if (m.includes("password should be")) return { text: "Choose a longer password (at least 8 characters)." };
  return { text: message };
}

/** 0–4: length, mixed case, digit, symbol. */
function passwordStrength(password: string): number {
  if (!password) return 0;
  let score = password.length >= 8 ? 1 : 0;
  if (password.length >= 12) score += 1;
  if (/[a-z]/.test(password) && /[A-Z]/.test(password)) score += 1;
  if (/\d/.test(password) && /[^A-Za-z0-9]/.test(password)) score += 1;
  return Math.min(4, score);
}
const STRENGTH = ["Too short", "Weak", "Fair", "Good", "Strong"];

const HIGHLIGHTS = [
  { icon: PhoneCall, title: "AI voice agents", text: "Call leads in English, Hindi and Telugu — results land in your CRM." },
  { icon: Workflow, title: "Pipeline that updates itself", text: "Interested callers become leads and deals automatically." },
  { icon: BarChart3, title: "Call intelligence", text: "Transcripts, recordings, outcomes and sentiment for every call." },
];

function BrandPanel() {
  return (
    <aside className="relative hidden overflow-hidden bg-gradient-primary p-10 text-primary-foreground lg:flex lg:flex-col">
      <div className="pointer-events-none absolute -right-24 -top-24 size-80 rounded-full bg-white/10 blur-2xl" />
      <div className="pointer-events-none absolute -bottom-32 -left-20 size-96 rounded-full bg-white/10 blur-3xl" />
      <Link to="/" className="relative inline-flex w-fit rounded-xl bg-white/90 px-3 py-2"><Logo /></Link>
      <div className="relative mt-auto max-w-md">
        <p className="inline-flex items-center gap-1.5 rounded-full bg-white/15 px-3 py-1 text-xs font-semibold"><Sparkles className="size-3.5" /> AI calling, built into your CRM</p>
        <h2 className="mt-4 text-3xl font-bold leading-tight tracking-tight">Every customer, call and deal — in one place.</h2>
        <ul className="mt-8 space-y-5">
          {HIGHLIGHTS.map(({ icon: Icon, title, text }) => (
            <li key={title} className="flex gap-3">
              <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-white/15"><Icon className="size-4.5" /></span>
              <span><span className="block text-sm font-semibold">{title}</span><span className="block text-sm text-white/80">{text}</span></span>
            </li>
          ))}
        </ul>
        {/* A glimpse of the product: what a finished call looks like. */}
        <div className="mt-10 rounded-2xl bg-white/95 p-4 text-foreground shadow-xl">
          <div className="flex items-center justify-between text-xs">
            <span className="inline-flex items-center gap-1.5 font-semibold text-success"><span className="size-2 rounded-full bg-success" /> Call completed · 1m 17s</span>
            <span className="rounded-full bg-accent px-2 py-0.5 font-semibold text-accent-foreground">Qualified</span>
          </div>
          <p className="mt-2 text-sm">"Interested in health insurance for his parents — agreed to a callback tomorrow at 11 AM."</p>
          <p className="mt-2 text-xs text-muted-foreground">Lead created · Deal moved to Qualification · Follow-up task added</p>
        </div>
      </div>
    </aside>
  );
}

function AuthPage() {
  const search = Route.useSearch();
  const navigate = useNavigate();
  const [mode, setMode] = useState<Mode>(search.mode ?? "signin");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState<string | null>(null);
  const [error, setError] = useState<{ text: string; unconfirmed?: boolean } | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [form, setForm] = useState({ name: "", email: "", password: "" });
  const target = safePath(search.redirect);
  const strength = useMemo(() => passwordStrength(form.password), [form.password]);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => { if (data.user) navigate({ to: target, replace: true }); });
    const { data } = supabase.auth.onAuthStateChange((e, s) => { if (e === "SIGNED_IN" && s) navigate({ to: target, replace: true }); });
    return () => data.subscription.unsubscribe();
  }, [navigate, target]);

  const switchMode = (next: Mode) => { setMode(next); setError(null); };

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      if (mode === "signin") {
        const { error } = await supabase.auth.signInWithPassword({ email: form.email.trim(), password: form.password });
        if (error) throw error;
      } else if (mode === "signup") {
        const { error } = await supabase.auth.signUp({
          email: form.email.trim(), password: form.password,
          options: { data: { full_name: form.name.trim() }, emailRedirectTo: window.location.origin + target },
        });
        if (error) throw error;
        setSent(`We sent a confirmation link to ${form.email.trim()}. Open it, then sign in.`);
      } else {
        const { error } = await supabase.auth.resetPasswordForEmail(form.email.trim(), { redirectTo: `${window.location.origin}/reset-password` });
        if (error) throw error;
        setSent("If that email has an account, a reset link is on its way.");
      }
    } catch (err) {
      setError(friendlyError(err instanceof Error ? err.message : "Something went wrong"));
    } finally { setBusy(false); }
  }

  async function resendConfirmation() {
    setBusy(true);
    const { error } = await supabase.auth.resend({ type: "signup", email: form.email.trim(), options: { emailRedirectTo: window.location.origin + target } });
    setBusy(false);
    if (error) setError(friendlyError(error.message));
    else setSent(`We sent a new confirmation link to ${form.email.trim()}.`);
  }

  async function google() {
    if (search.redirect) sessionStorage.setItem("yulabs.redirect", target);
    const r = await lovable.auth.signInWithOAuth("google", { redirect_uri: window.location.origin + "/auth" });
    if (r.error) setError({ text: "Google sign-in didn't work. Use your email and password instead." });
  }

  const copy = {
    signin: { title: "Welcome back", sub: "Sign in to your Yulabs workspace.", cta: "Sign in" },
    signup: { title: "Create your account", sub: "Start calling leads with AI in a few minutes.", cta: "Create account" },
    forgot: { title: "Reset your password", sub: "Enter your email and we'll send a secure reset link.", cta: "Send reset link" },
  }[mode];

  return (
    <div className="grid min-h-screen bg-background lg:grid-cols-[1.05fr_1fr]">
      <BrandPanel />
      <main className="dot-canvas flex items-center justify-center px-4 py-10 sm:px-8">
        <div className="w-full max-w-[26rem] animate-rise">
          <Link to="/" className="mb-8 flex justify-center lg:hidden"><Logo /></Link>

          {sent ? (
            <div className="rounded-3xl border bg-card p-8 text-center shadow-float">
              <span className="mx-auto grid size-14 place-items-center rounded-2xl bg-success-soft text-success"><MailCheck className="size-6" /></span>
              <h1 className="mt-5 text-xl font-bold">Check your email</h1>
              <p className="mt-2 text-sm text-muted-foreground">{sent}</p>
              <Button variant="outline" className="mt-6 w-full" onClick={() => { setSent(null); switchMode("signin"); }}>Back to sign in</Button>
            </div>
          ) : (
            <div className="rounded-3xl border bg-card p-7 shadow-float sm:p-8">
              {mode === "forgot" ? (
                <button type="button" onClick={() => switchMode("signin")} className="mb-5 inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground">
                  <ArrowLeft className="size-4" /> Back to sign in
                </button>
              ) : (
                <div className="mb-6 grid grid-cols-2 rounded-xl bg-muted p-1 text-sm font-semibold" role="tablist" aria-label="Sign in or create an account">
                  {(["signin", "signup"] as const).map((value) => (
                    <button key={value} type="button" role="tab" aria-selected={mode === value} onClick={() => switchMode(value)}
                      className={cn("rounded-lg py-2 transition-colors", mode === value ? "bg-card text-foreground shadow-soft" : "text-muted-foreground hover:text-foreground")}>
                      {value === "signin" ? "Sign in" : "Create account"}
                    </button>
                  ))}
                </div>
              )}

              <h1 className="text-2xl font-bold tracking-tight">{copy.title}</h1>
              <p className="mt-1 text-sm text-muted-foreground">{copy.sub}</p>

              {error && (
                <div role="alert" className="mt-5 flex gap-2.5 rounded-xl border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
                  <AlertCircle className="mt-0.5 size-4 shrink-0" />
                  <div className="space-y-1.5">
                    <p>{error.text}</p>
                    {error.unconfirmed && (
                      <button type="button" onClick={resendConfirmation} disabled={busy} className="font-semibold underline underline-offset-2">Resend confirmation email</button>
                    )}
                  </div>
                </div>
              )}

              {mode !== "forgot" && (
                <>
                  <button type="button" onClick={google} className="mt-6 flex h-11 w-full items-center justify-center gap-2.5 rounded-xl border bg-background text-sm font-medium transition hover:bg-muted">
                    <GoogleIcon /> Continue with Google
                  </button>
                  <div className="my-5 flex items-center gap-3 text-xs text-muted-foreground"><span className="h-px flex-1 bg-border" />or with email<span className="h-px flex-1 bg-border" /></div>
                </>
              )}

              <form onSubmit={submit} className={mode === "forgot" ? "mt-6 space-y-4" : "space-y-4"} noValidate={false}>
                {mode === "signup" && (
                  <div className="space-y-1.5">
                    <Label htmlFor="name">Full name</Label>
                    <Input id="name" autoComplete="name" required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="h-11 rounded-xl" placeholder="Your name" />
                  </div>
                )}
                <div className="space-y-1.5">
                  <Label htmlFor="email">Work email</Label>
                  <Input id="email" type="email" autoComplete="email" required value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} className="h-11 rounded-xl" placeholder="you@company.com" />
                </div>
                {mode !== "forgot" && (
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <Label htmlFor="pw">Password</Label>
                      {mode === "signin" && <button type="button" onClick={() => switchMode("forgot")} className="text-xs font-medium text-primary hover:underline">Forgot password?</button>}
                    </div>
                    <div className="relative">
                      <Input id="pw" type={showPassword ? "text" : "password"} autoComplete={mode === "signin" ? "current-password" : "new-password"} required minLength={8}
                        value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} className="h-11 rounded-xl pr-11" placeholder={mode === "signup" ? "At least 8 characters" : ""} />
                      <button type="button" onClick={() => setShowPassword((v) => !v)} aria-label={showPassword ? "Hide password" : "Show password"}
                        className="absolute right-1.5 top-1/2 grid size-8 -translate-y-1/2 place-items-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground">
                        {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                      </button>
                    </div>
                    {mode === "signup" && form.password && (
                      <div className="flex items-center gap-2 pt-1" aria-live="polite">
                        <div className="flex flex-1 gap-1">
                          {[1, 2, 3, 4].map((step) => (
                            <span key={step} className={cn("h-1 flex-1 rounded-full transition-colors", strength >= step ? (strength >= 3 ? "bg-success" : strength === 2 ? "bg-primary-glow" : "bg-destructive") : "bg-muted")} />
                          ))}
                        </div>
                        <span className="w-16 text-right text-xs text-muted-foreground">{STRENGTH[strength]}</span>
                      </div>
                    )}
                  </div>
                )}
                <Button type="submit" variant="hero" size="lg" className="w-full" disabled={busy || (mode === "signup" && form.password.length > 0 && form.password.length < 8)}>
                  {busy && <Loader2 className="animate-spin" />}
                  {copy.cta}
                </Button>
              </form>

              {mode === "signup" && (
                <ul className="mt-5 space-y-1.5 text-xs text-muted-foreground">
                  {["Your workspace and a ready-to-use AI voice agent", "Invite your team any time"].map((line) => (
                    <li key={line} className="flex items-center gap-1.5"><CheckCircle2 className="size-3.5 text-success" /> {line}</li>
                  ))}
                </ul>
              )}
            </div>
          )}
          <p className="mt-6 text-center text-xs text-muted-foreground">Protected sign-in · Your data stays in your workspace</p>
        </div>
      </main>
    </div>
  );
}
