import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ArrowLeft, ArrowRight, Check, Loader2, Plus, X } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Logo } from "@/components/app/Logo";
import { ROLE_LABELS, type OrgRole } from "@/lib/org";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/onboarding")({
  head: () => ({
    meta: [
      { title: "Set up your workspace — Yulabs CRM" },
      { name: "description", content: "Create your organization and invite your team." },
      { property: "og:title", content: "Set up your workspace — Yulabs CRM" },
      { property: "og:description", content: "Create your organization and invite your team." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Onboarding,
});

const TYPES = ["Real estate", "Education", "Healthcare", "Financial services", "E-commerce", "SaaS / Technology", "Agency", "Other"];
const STEPS = ["Organization", "Company details", "Business type", "Invite team"];

function Onboarding() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [step, setStep] = useState(0);
  const [busy, setBusy] = useState(false);
  const [f, setF] = useState({ name: "", website: "", phone: "", country: "India", industry: "", business_type: "" });
  const [invites, setInvites] = useState<{ email: string; role: OrgRole }[]>([]);
  const [draft, setDraft] = useState("");

  async function finish() {
    setBusy(true);
    try {
      const slug = f.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") + "-" + Math.random().toString(36).slice(2, 6);
      const { data: org, error } = await supabase.from("organizations").insert({ ...f, slug, onboarding_completed: true, onboarding_step: 4 }).select("id").single();
      if (error) throw error;
      if (invites.length) {
        const { error: e2 } = await supabase.from("invitations").insert(invites.map((i) => ({ ...i, organization_id: org.id })));
        if (e2) throw e2;
      }
      localStorage.setItem("yulabs.org", org.id);
      await qc.invalidateQueries({ queryKey: ["memberships"] });
      toast.success("Workspace ready");
      navigate({ to: "/dashboard" });
    } catch (e) { toast.error(e instanceof Error ? e.message : "Could not create workspace"); }
    finally { setBusy(false); }
  }

  const canNext = step === 0 ? f.name.trim().length > 1 : step === 2 ? !!f.business_type : true;

  return (
    <div className="dot-canvas min-h-screen px-4 py-8 sm:py-12">
      <div className="mx-auto max-w-xl animate-rise">
        <div className="mb-8 flex justify-center"><Logo /></div>
        <ol className="mb-6 flex items-center gap-2" aria-label="Onboarding steps">
          {STEPS.map((s, i) => (
            <li key={s} className="flex flex-1 items-center gap-2">
              <span className={cn("grid size-7 shrink-0 place-items-center rounded-full text-xs font-bold", i < step ? "bg-success text-primary-foreground" : i === step ? "bg-gradient-primary text-primary-foreground" : "border bg-card text-muted-foreground")}>
                {i < step ? <Check className="size-3.5" /> : i + 1}
              </span>
              <span className={cn("hidden text-xs font-medium sm:inline", i === step ? "text-foreground" : "text-muted-foreground")}>{s}</span>
              {i < STEPS.length - 1 && <span className="h-px flex-1 bg-border" />}
            </li>
          ))}
        </ol>
        <div className="rounded-3xl border bg-card p-8 shadow-float">
          {step === 0 && (<>
            <h1 className="text-2xl font-bold">Name your organization</h1>
            <p className="mt-1 text-sm text-muted-foreground">This is the workspace your team will share.</p>
            <div className="mt-6 space-y-1.5"><Label htmlFor="n">Organization name</Label><Input id="n" autoFocus value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="Acme Realty" className="h-11 rounded-xl" /></div>
          </>)}
          {step === 1 && (<>
            <h1 className="text-2xl font-bold">Company details</h1>
            <p className="mt-1 text-sm text-muted-foreground">Optional — you can change these later.</p>
            <div className="mt-6 grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5 sm:col-span-2"><Label htmlFor="w">Website</Label><Input id="w" value={f.website} onChange={(e) => setF({ ...f, website: e.target.value })} className="rounded-xl" /></div>
              <div className="space-y-1.5"><Label htmlFor="p">Phone</Label><Input id="p" value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} className="rounded-xl" /></div>
              <div className="space-y-1.5"><Label htmlFor="c">Country</Label><Input id="c" value={f.country} onChange={(e) => setF({ ...f, country: e.target.value })} className="rounded-xl" /></div>
              <div className="space-y-1.5 sm:col-span-2"><Label htmlFor="i">Industry</Label><Input id="i" value={f.industry} onChange={(e) => setF({ ...f, industry: e.target.value })} className="rounded-xl" /></div>
            </div>
          </>)}
          {step === 2 && (<>
            <h1 className="text-2xl font-bold">What kind of business?</h1>
            <p className="mt-1 text-sm text-muted-foreground">We'll tailor your workspace to it.</p>
            <div className="mt-6 grid grid-cols-2 gap-2">
              {TYPES.map((t) => (
                <button key={t} type="button" onClick={() => setF({ ...f, business_type: t })}
                  className={cn("rounded-xl border px-3 py-3 text-left text-sm font-medium transition", f.business_type === t ? "border-primary bg-accent text-accent-foreground" : "hover:bg-muted")}>{t}</button>
              ))}
            </div>
          </>)}
          {step === 3 && (<>
            <h1 className="text-2xl font-bold">Invite your team</h1>
            <p className="mt-1 text-sm text-muted-foreground">They'll join once they sign in with this email. You can skip this.</p>
            <form className="mt-6 flex gap-2" onSubmit={(e) => { e.preventDefault(); if (draft.includes("@")) { setInvites([...invites, { email: draft.trim(), role: "sales_rep" }]); setDraft(""); } }}>
              <Input type="email" value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="teammate@company.com" className="rounded-xl" />
              <Button type="submit" variant="outline"><Plus /> Add</Button>
            </form>
            <ul className="mt-4 space-y-2">
              {invites.map((iv, i) => (
                <li key={i} className="flex items-center gap-2 rounded-xl border px-3 py-2 text-sm">
                  <span className="flex-1 truncate">{iv.email}</span>
                  <select value={iv.role} onChange={(e) => setInvites(invites.map((x, j) => (j === i ? { ...x, role: e.target.value as OrgRole } : x)))} className="rounded-lg border bg-background px-2 py-1 text-xs">
                    {(Object.keys(ROLE_LABELS) as OrgRole[]).filter((r) => r !== "owner").map((r) => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
                  </select>
                  <button onClick={() => setInvites(invites.filter((_, j) => j !== i))} aria-label="Remove"><X className="size-4 text-muted-foreground" /></button>
                </li>
              ))}
            </ul>
          </>)}
          <div className="mt-8 flex justify-between">
            <Button variant="ghost" disabled={step === 0} onClick={() => setStep(step - 1)}><ArrowLeft /> Back</Button>
            {step < 3
              ? <Button variant="hero" disabled={!canNext} onClick={() => setStep(step + 1)}>Continue <ArrowRight /></Button>
              : <Button variant="hero" disabled={busy} onClick={finish}>{busy && <Loader2 className="animate-spin" />} Create workspace</Button>}
          </div>
        </div>
      </div>
    </div>
  );
}
