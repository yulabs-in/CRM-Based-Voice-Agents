import { useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { CalendarClock, Loader2, Search } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { PageHeader } from "@/components/app/PageHeader";
import { StatusBadge } from "@/components/app/StatusBadge";
import { CampaignControls } from "@/components/app/CampaignControls";
import { supabase } from "@/lib/supabase";
import { useOrg } from "@/lib/org";
import { pageHead } from "@/lib/seo";
import { scheduleCalls } from "@/lib/automation.functions";

export const Route = createFileRoute("/_authenticated/_app/scheduled-actions")({
  head: () => pageHead("Scheduled Actions", "Calls scheduled for later, by you or by automations."),
  component: Page,
});

const CAMPAIGN_ROLES = ["owner", "admin", "sales_manager", "voice_manager"];
const NONE = "__none";
const inMinutes = (minutes: number) => {
  const d = new Date(Date.now() + minutes * 60_000);
  d.setSeconds(0, 0);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
};

function Page() {
  const { org, role } = useOrg();
  const qc = useQueryClient();
  const schedule = useServerFn(scheduleCalls);
  const canSchedule = CAMPAIGN_ROLES.includes(role);
  const [mode, setMode] = useState<"contacts" | "project">("contacts");
  const [form, setForm] = useState({ name: "", agentId: "", projectId: "", when: inMinutes(15), from: "09:00", to: "21:00" });
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [query, setQuery] = useState("");
  const [consent, setConsent] = useState(false);
  const set = <K extends keyof typeof form>(key: K, value: (typeof form)[K]) => setForm((f) => ({ ...f, [key]: value }));

  const options = useQuery({
    queryKey: ["scheduled", org.id, "options"],
    queryFn: async () => {
      const [agents, projects, contacts] = await Promise.all([
        supabase.from("voice_agents").select("id, name").eq("organization_id", org.id).eq("status", "active"),
        supabase.from("projects").select("id, name, contact_count").eq("organization_id", org.id).eq("status", "active"),
        supabase.from("contacts").select("id, first_name, last_name, phone, status").eq("organization_id", org.id).not("phone", "is", null).order("created_at", { ascending: false }).limit(1000),
      ]);
      return { agents: agents.data ?? [], projects: projects.data ?? [], contacts: contacts.data ?? [] };
    },
  });
  const scheduled = useQuery({
    queryKey: ["campaigns", org.id, "scheduled"],
    refetchInterval: 20000,
    queryFn: async () => {
      const { data, error } = await supabase.from("call_campaigns")
        .select("id, name, status, source, starts_at, target_count, consent_confirmed, allowed_start_time, allowed_end_time, allowed_days, timezone, last_error, project:projects(name)")
        .eq("organization_id", org.id).in("source", ["scheduled", "automation"]).order("starts_at", { ascending: false }).limit(100);
      if (error) throw error;
      return data;
    },
  });

  const agentId = form.agentId || options.data?.agents[0]?.id || "";
  const filtered = useMemo(() => {
    const text = query.trim().toLowerCase();
    return (options.data?.contacts ?? []).filter((c) => !text || `${c.first_name} ${c.last_name ?? ""} ${c.phone}`.toLowerCase().includes(text)).slice(0, 200);
  }, [options.data, query]);
  const startsAt = new Date(form.when);
  const tooSoon = startsAt.getTime() < Date.now() + 3 * 60_000;
  const ready = form.name.trim() && agentId && consent && form.from < form.to && !Number.isNaN(startsAt.getTime()) && (mode === "project" ? !!form.projectId : picked.size > 0);

  const submit = useMutation({
    mutationFn: () => schedule({ data: {
      organizationId: org.id, name: form.name.trim(), agentId, startsAt: (tooSoon ? new Date(Date.now() + 3 * 60_000) : startsAt).toISOString(),
      allowedStartTime: form.from, allowedEndTime: form.to, consentConfirmed: true,
      ...(mode === "project" ? { projectId: form.projectId } : { contactIds: [...picked] }),
    } }),
    onSuccess: (result) => {
      toast.success(`Scheduled ${result.contacts} call${result.contacts === 1 ? "" : "s"} on Sarvam`);
      setPicked(new Set()); setConsent(false); set("name", "");
      void qc.invalidateQueries({ queryKey: ["campaigns"] });
    },
    onError: (error) => toast.error(error.message),
  });

  return (
    <div className="animate-rise space-y-6">
      <PageHeader title="Scheduled Actions" description="Schedule Sarvam to call contacts later. Automations (e.g. “call back tomorrow”) also show up here." />

      {canSchedule && (
        <section className="space-y-4 rounded-2xl border bg-card p-5 shadow-soft">
          <h2 className="flex items-center gap-2 font-semibold"><CalendarClock className="size-5 text-primary" /> Schedule calls</h2>
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="space-y-1.5"><Label htmlFor="sc-name">Name</Label><Input id="sc-name" value={form.name} maxLength={100} placeholder="e.g. Follow-up calls Friday" onChange={(e) => set("name", e.target.value)} className="rounded-xl" /></div>
            <div className="space-y-1.5"><Label>Voice agent</Label>
              <Select value={agentId || NONE} onValueChange={(v) => set("agentId", v === NONE ? "" : v)}>
                <SelectTrigger className="rounded-xl" aria-label="Voice agent"><SelectValue placeholder="Choose agent" /></SelectTrigger>
                <SelectContent>{options.data?.agents.map((a) => <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5"><Label htmlFor="sc-when">Start at</Label><Input id="sc-when" type="datetime-local" value={form.when} onChange={(e) => set("when", e.target.value)} className="rounded-xl" />
              {tooSoon && <p className="text-xs text-muted-foreground">Sarvam needs ≥2 min — will start in 3 min.</p>}</div>
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="space-y-1.5"><Label htmlFor="sc-from">Calling hours from</Label><Input id="sc-from" type="time" value={form.from} onChange={(e) => set("from", e.target.value)} className="rounded-xl" /></div>
            <div className="space-y-1.5"><Label htmlFor="sc-to">to</Label><Input id="sc-to" type="time" value={form.to} onChange={(e) => set("to", e.target.value)} className="rounded-xl" /></div>
            <div className="space-y-1.5"><Label>Who to call</Label>
              <Select value={mode} onValueChange={(v) => setMode(v as "contacts" | "project")}>
                <SelectTrigger className="rounded-xl" aria-label="Who to call"><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="contacts">Pick contacts</SelectItem><SelectItem value="project">A whole project</SelectItem></SelectContent>
              </Select>
            </div>
          </div>

          {mode === "project" ? (
            <Select value={form.projectId || NONE} onValueChange={(v) => set("projectId", v === NONE ? "" : v)}>
              <SelectTrigger className="rounded-xl" aria-label="Project"><SelectValue placeholder="Choose project" /></SelectTrigger>
              <SelectContent><SelectItem value={NONE}>Choose project…</SelectItem>{options.data?.projects.map((p) => <SelectItem key={p.id} value={p.id}>{p.name} ({p.contact_count})</SelectItem>)}</SelectContent>
            </Select>
          ) : (
            <div className="rounded-xl border">
              <div className="flex items-center gap-2 border-b p-2">
                <div className="relative w-full max-w-xs"><Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" /><Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search contacts…" className="h-8 rounded-lg pl-9" /></div>
                <span className="ml-auto text-xs text-muted-foreground">{picked.size} selected</span>
              </div>
              <ul className="max-h-56 divide-y overflow-y-auto text-sm">
                {options.isLoading ? <li className="p-3"><Skeleton className="h-8" /></li> : filtered.map((c) => (
                  <li key={c.id}>
                    <label className="flex cursor-pointer items-center gap-2 px-3 py-1.5 hover:bg-muted/50">
                      <Checkbox checked={picked.has(c.id)} onCheckedChange={(checked) => setPicked((prev) => { const next = new Set(prev); if (checked) next.add(c.id); else next.delete(c.id); return next; })} />
                      <span className="font-medium">{c.first_name} {c.last_name ?? ""}</span>
                      <span className="text-xs text-muted-foreground">{c.phone}</span>
                      {c.status === "inactive" && <StatusBadge value="inactive" />}
                    </label>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <label className="flex items-start gap-2 rounded-xl border border-primary/30 bg-accent/40 p-3 text-sm">
            <Checkbox checked={consent} onCheckedChange={(v) => setConsent(v === true)} className="mt-0.5" />
            <span>I confirm these people agreed to be contacted and the agent announces it is an AI and that calls are recorded.</span>
          </label>
          <Button variant="hero" disabled={!ready || submit.isPending} onClick={() => submit.mutate()}>
            {submit.isPending ? <Loader2 className="animate-spin" /> : <CalendarClock />} Schedule {mode === "contacts" && picked.size ? `${picked.size} call${picked.size === 1 ? "" : "s"}` : "calls"}
          </Button>
        </section>
      )}

      <section className="space-y-3">
        <h2 className="text-sm font-semibold">Scheduled & automated calls</h2>
        {scheduled.isLoading ? <Skeleton className="h-24 rounded-2xl" /> : !scheduled.data?.length ? (
          <p className="rounded-2xl border border-dashed p-6 text-center text-sm text-muted-foreground">Nothing scheduled. Schedule calls above, or add a “Schedule a callback call” action to a workflow.</p>
        ) : (
          <div className="overflow-x-auto rounded-2xl border bg-card shadow-soft">
            <table className="w-full text-sm">
              <thead><tr className="border-b text-left text-xs uppercase tracking-wide text-muted-foreground">
                {["Name", "Source", "Starts", "Contacts", "Status", "Actions"].map((h) => <th key={h} className="px-4 py-2.5">{h}</th>)}
              </tr></thead>
              <tbody>
                {scheduled.data.map((row) => (
                  <tr key={row.id} className="border-b last:border-0">
                    <td className="px-4 py-2.5"><Link to="/call-campaigns/$campaignId" params={{ campaignId: row.id }} className="font-semibold hover:text-primary">{row.name}</Link>
                      {row.last_error && <p className="max-w-64 truncate text-xs text-destructive" title={row.last_error}>{row.last_error}</p>}</td>
                    <td className="px-4 py-2.5">{row.source === "automation" ? "Automation" : "Scheduled by you"}</td>
                    <td className="px-4 py-2.5 tabular-nums">{row.starts_at ? new Date(row.starts_at).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "—"}</td>
                    <td className="px-4 py-2.5 tabular-nums">{row.target_count}</td>
                    <td className="px-4 py-2.5"><StatusBadge value={row.status} /></td>
                    <td className="px-4 py-2.5"><CampaignControls campaign={row} compact /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
