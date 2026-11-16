import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState, type FormEvent } from "react";
import { toast } from "sonner";
import { Loader2, MailCheck } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Logo } from "@/components/app/Logo";

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

function AuthPage() {
  const search = Route.useSearch();
  const navigate = useNavigate();
  const [mode, setMode] = useState<Mode>(search.mode ?? "signin");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState<string | null>(null);
  const [form, setForm] = useState({ name: "", email: "", password: "" });
  const target = safePath(search.redirect);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => { if (data.user) navigate({ to: target, replace: true }); });
    const { data } = supabase.auth.onAuthStateChange((e, s) => { if (e === "SIGNED_IN" && s) navigate({ to: target, replace: true }); });
    return () => data.subscription.unsubscribe();
  }, [navigate, target]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      if (mode === "signin") {
        const { error } = await supabase.auth.signInWithPassword({ email: form.email, password: form.password });
        if (error) throw error;
      } else if (mode === "signup") {
        const { error } = await supabase.auth.signUp({
          email: form.email, password: form.password,
          options: { data: { full_name: form.name }, emailRedirectTo: window.location.origin + target },
        });
        if (error) throw error;
        setSent("Check your inbox to confirm your email, then sign in.");
      } else {
        const { error } = await supabase.auth.resetPasswordForEmail(form.email, { redirectTo: `${window.location.origin}/reset-password` });
        if (error) throw error;
        setSent("If that email has an account, a reset link is on its way.");
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Something went wrong");
    } finally { setBusy(false); }
  }

  async function google() {
    if (search.redirect) sessionStorage.setItem("yulabs.redirect", target);
    const r = await lovable.auth.signInWithOAuth("google", { redirect_uri: window.location.origin + "/auth" });
    if (r.error) toast.error("Google sign-in failed");
  }

  const titles = { signin: "Welcome back", signup: "Create your account", forgot: "Reset your password" };

  return (
    <div className="dot-canvas grid min-h-screen place-items-center px-4 py-10">
      <div className="w-full max-w-md animate-rise">
        <Link to="/" className="mb-6 flex justify-center"><Logo /></Link>
        <div className="rounded-3xl border bg-card p-8 shadow-float">
          {sent ? (
            <div className="text-center">
              <span className="mx-auto grid size-12 place-items-center rounded-2xl bg-success-soft text-success"><MailCheck /></span>
              <h1 className="mt-4 text-xl font-bold">Check your email</h1>
              <p className="mt-2 text-sm text-muted-foreground">{sent}</p>
              <Button variant="outline" className="mt-6 w-full" onClick={() => { setSent(null); setMode("signin"); }}>Back to sign in</Button>
            </div>
          ) : (
            <>
              <h1 className="text-2xl font-bold tracking-tight">{titles[mode]}</h1>
              <p className="mt-1 text-sm text-muted-foreground">
                {mode === "signup" ? "Start managing customers and AI calls in minutes." : mode === "forgot" ? "We'll email you a secure reset link." : "Sign in to your Yulabs workspace."}
              </p>
              {mode !== "forgot" && (
                <>
                  <button type="button" onClick={google} className="mt-6 flex h-11 w-full items-center justify-center gap-2.5 rounded-xl border bg-background text-sm font-medium transition hover:bg-muted">
                    <GoogleIcon /> Continue with Google
                  </button>
                  <div className="my-5 flex items-center gap-3 text-xs text-muted-foreground"><span className="h-px flex-1 bg-border" />or<span className="h-px flex-1 bg-border" /></div>
                </>
              )}
              <form onSubmit={submit} className={mode === "forgot" ? "mt-6 space-y-4" : "space-y-4"}>
                {mode === "signup" && (
                  <div className="space-y-1.5"><Label htmlFor="name">Full name</Label><Input id="name" required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="h-11 rounded-xl" /></div>
                )}
                <div className="space-y-1.5"><Label htmlFor="email">Work email</Label><Input id="email" type="email" required value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} className="h-11 rounded-xl" /></div>
                {mode !== "forgot" && (
                  <div className="space-y-1.5">
                    <div className="flex justify-between"><Label htmlFor="pw">Password</Label>
                      {mode === "signin" && <button type="button" onClick={() => setMode("forgot")} className="text-xs font-medium text-primary hover:underline">Forgot password?</button>}
                    </div>
                    <Input id="pw" type="password" required minLength={8} value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} className="h-11 rounded-xl" />
                  </div>
                )}
                <Button type="submit" variant="hero" size="lg" className="w-full" disabled={busy}>
                  {busy && <Loader2 className="animate-spin" />}
                  {mode === "signin" ? "Sign in" : mode === "signup" ? "Create account" : "Send reset link"}
                </Button>
              </form>
              <p className="mt-6 text-center text-sm text-muted-foreground">
                {mode === "signin" ? "New to Yulabs? " : "Already have an account? "}
                <button type="button" className="font-semibold text-primary hover:underline" onClick={() => setMode(mode === "signin" ? "signup" : "signin")}>
                  {mode === "signin" ? "Create an account" : "Sign in"}
                </button>
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
