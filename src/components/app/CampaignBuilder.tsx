import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, Plus, Rocket, Save, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/lib/supabase";
import { useOrg } from "@/lib/org";
import { humanize, asAnswers } from "@/lib/sarvam-call";
import { BUILTIN_SOURCES, isValidVariableName, type VariableMap, type VariableSource } from "@/lib/campaign-vars";
import { launchCampaign } from "@/lib/campaigns.functions";

const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
type VariableRow = { name: string; source: VariableSource };

type Props = { open: boolean; onOpenChange: (open: boolean) => void; projectId?: string; onSaved?: (campaignId: string) => void };

export function CampaignBuilder({ open, onOpenChange, projectId, onSaved }: Props) {
  const { org } = useOrg();
  const qc = useQueryClient();
  const launch = useServerFn(launchCampaign);
  const [form, setForm] = useState({
    name: "", project_id: projectId ?? "", agent_id: "", starts_at: "", allowed_start_time: "09:00", allowed_end_time: "21:00",
    allowed_days: DAYS.slice(0, 6), timezone: org.timezone || "Asia/Kolkata", max_retries: 2, retry_interval_minutes: 60, attempts_per_second: 1, notes: "",
  });
  const [variables, setVariables] = useState<VariableRow[]>([{ name: "customer_name", source: "full_name" }]);
  const [consent, setConsent] = useState(false);
  const set = <K extends keyof typeof form>(key: K, value: (typeof form)[K]) => setForm((current) => ({ ...current, [key]: value }));

  useEffect(() => { if (projectId) set("project_id", projectId); }, [projectId]);

  const options = useQuery({
    queryKey: ["campaign-builder", org.id],
    enabled: open,
    queryFn: async () => {
      const [projects, agents] = await Promise.all([
        supabase.from("projects").select("id, name, contact_count").eq("organization_id", org.id).eq("status", "active").order("created_at", { ascending: false }),
        supabase.from("voice_agents").select("id, name, sarvam_agent_id, sarvam_connection_id, sarvam_agent_phone_number").eq("organization_id", org.id).eq("status", "active").order("created_at"),
      ]);
      if (projects.error) throw projects.error;
      if (agents.error) throw agents.error;
      return { projects: projects.data ?? [], agents: agents.data ?? [] };
    },
  });

  // Custom columns from the selected project's file, offered as variable sources.
  const customKeys = useQuery({
    queryKey: ["campaign-builder", org.id, "custom", form.project_id],
    enabled: open && !!form.project_id,
    queryFn: async () => {
      const { data } = await supabase.from("contacts").select("custom_fields").eq("project_id", form.project_id).limit(200);
      const keys = new Set<string>();
      for (const row of data ?? []) for (const key of Object.keys(asAnswers(row.custom_fields))) if (!key.startsWith("raw_")) keys.add(key);
      return [...keys].sort();
    },
  });

  useEffect(() => {
    if (!form.agent_id && options.data?.agents.length) set("agent_id", options.data.agents[0]!.id);
  }, [options.data, form.agent_id]);

  const agent = options.data?.agents.find((item) => item.id === form.agent_id);
  const agentReady = Boolean(agent?.sarvam_agent_id && agent.sarvam_connection_id && agent.sarvam_agent_phone_number);
  const project = options.data?.projects.find((item) => item.id === form.project_id);
  const variableError = useMemo(() => {
    const names = variables.map((row) => row.name.trim()).filter(Boolean);
    if (names.some((name) => !isValidVariableName(name))) return "Variable names may use letters, numbers and _ only, and can't start with a number";
    if (new Set(names).size !== names.length) return "Each variable name can be used once";
    return null;
  }, [variables]);
  const valid = form.name.trim() && form.project_id && form.agent_id && form.allowed_days.length && form.allowed_start_time < form.allowed_end_time && !variableError;

  const save = useMutation({
    mutationFn: async (andLaunch: boolean) => {
      const agentVariables: VariableMap = Object.fromEntries(variables.filter((row) => row.name.trim()).map((row) => [row.name.trim(), row.source]));
      const { data, error } = await supabase.from("call_campaigns").insert({
        organization_id: org.id, name: form.name.trim(), project_id: form.project_id, agent_id: form.agent_id,
        audience: project?.name ?? null, status: "draft", starts_at: form.starts_at ? new Date(form.starts_at).toISOString() : null,
        allowed_start_time: form.allowed_start_time, allowed_end_time: form.allowed_end_time, allowed_days: form.allowed_days, timezone: form.timezone,
        max_retries: form.max_retries, retry_interval_minutes: form.retry_interval_minutes, attempts_per_second: form.attempts_per_second,
        agent_variables: agentVariables, consent_confirmed: consent, notes: form.notes || null, target_count: project?.contact_count ?? 0,
      }).select("id").single();
      if (error || !data) throw new Error(error?.message ?? "Could not save the campaign");
      if (andLaunch) {
        try {
          const result = await launch({ data: { campaignId: data.id } });
          toast.success(`Campaign launched — ${result.contacts.toLocaleString()} contacts sent to Sarvam`);
          if (result.errors.length) toast.warning(result.errors.join(" · "));
        } catch (launchError) {
          toast.error(`Saved, but launch failed: ${launchError instanceof Error ? launchError.message : "unknown error"}`);
        }
      } else toast.success("Campaign saved as draft");
      return data.id;
    },
    onSuccess: (campaignId) => {
      void qc.invalidateQueries({ queryKey: ["campaigns"] });
      void qc.invalidateQueries({ queryKey: ["projects"] });
      onOpenChange(false);
      setConsent(false);
      onSaved?.(campaignId);
    },
    onError: (error) => toast.error(error.message),
  });

  const sourceOptions = [...BUILTIN_SOURCES, ...(customKeys.data ?? []).map((key) => ({ value: `custom.${key}` as VariableSource, label: `File column: ${humanize(key)}` }))];

  return (
    <Dialog open={open} onOpenChange={(next) => !save.isPending && onOpenChange(next)}>
      <DialogContent className="max-h-[92vh] max-w-[calc(100vw-1.5rem)] overflow-y-auto rounded-2xl sm:max-w-2xl [&>*]:min-w-0">
        <DialogHeader>
          <DialogTitle>New project campaign</DialogTitle>
          <DialogDescription>A Sarvam voice agent calls every contact with a valid phone in the project, within your calling hours, retrying busy and unanswered numbers.</DialogDescription>
        </DialogHeader>

        <div className="space-y-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Campaign name *"><Input value={form.name} maxLength={100} onChange={(event) => set("name", event.target.value)} className="rounded-xl" placeholder="e.g. EMI reminder – November" /></Field>
            <Field label="Project to call *">
              <Select value={form.project_id || "__none"} onValueChange={(value) => set("project_id", value === "__none" ? "" : value)}>
                <SelectTrigger className="rounded-xl"><SelectValue placeholder="Choose a project" /></SelectTrigger>
                <SelectContent>{options.data?.projects.map((item) => <SelectItem key={item.id} value={item.id}>{item.name} ({item.contact_count.toLocaleString()})</SelectItem>)}</SelectContent>
              </Select>
            </Field>
            <Field label="Voice agent *">
              <Select value={form.agent_id || "__none"} onValueChange={(value) => set("agent_id", value === "__none" ? "" : value)}>
                <SelectTrigger className="rounded-xl"><SelectValue placeholder="Choose an agent" /></SelectTrigger>
                <SelectContent>{options.data?.agents.map((item) => <SelectItem key={item.id} value={item.id}>{item.name}</SelectItem>)}</SelectContent>
              </Select>
              {agent && !agentReady && <p className="text-xs text-warning">This agent is missing its Sarvam agent ID, connection ID or caller number (Voice Agents page).</p>}
              {options.data && !options.data.agents.length && <p className="text-xs text-muted-foreground">Create an active voice agent first.</p>}
            </Field>
            <Field label="Start (optional — default: now)"><Input type="datetime-local" value={form.starts_at} onChange={(event) => set("starts_at", event.target.value)} className="rounded-xl" /></Field>
          </div>

          <fieldset className="space-y-3 rounded-xl border p-4">
            <legend className="px-1 text-sm font-semibold">Calling hours</legend>
            <div className="grid gap-3 sm:grid-cols-3">
              <Field label="From"><Input type="time" value={form.allowed_start_time} onChange={(event) => set("allowed_start_time", event.target.value)} className="rounded-xl" /></Field>
              <Field label="To"><Input type="time" value={form.allowed_end_time} onChange={(event) => set("allowed_end_time", event.target.value)} className="rounded-xl" /></Field>
              <Field label="Timezone"><Input value={form.timezone} onChange={(event) => set("timezone", event.target.value)} className="rounded-xl" /></Field>
            </div>
            <div className="flex flex-wrap gap-3">
              {DAYS.map((day) => (
                <label key={day} className="flex items-center gap-1.5 text-sm">
                  <Checkbox checked={form.allowed_days.includes(day)} onCheckedChange={(checked) => set("allowed_days", checked ? [...form.allowed_days, day] : form.allowed_days.filter((item) => item !== day))} />
                  {day.slice(0, 3)}
                </label>
              ))}
            </div>
          </fieldset>

          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Retries per contact"><Input type="number" min={0} max={20} value={form.max_retries} onChange={(event) => set("max_retries", Math.min(20, Math.max(0, Number(event.target.value) || 0)))} className="rounded-xl" /></Field>
            <Field label="Minutes between retries"><Input type="number" min={1} value={form.retry_interval_minutes} onChange={(event) => set("retry_interval_minutes", Math.max(1, Number(event.target.value) || 60))} className="rounded-xl" /></Field>
            <Field label="Calls per second"><Input type="number" min={0.1} max={500} step={0.1} value={form.attempts_per_second} onChange={(event) => set("attempts_per_second", Math.min(500, Math.max(0.1, Number(event.target.value) || 1)))} className="rounded-xl" /></Field>
          </div>

          <fieldset className="space-y-3 rounded-xl border p-4">
            <legend className="px-1 text-sm font-semibold">Agent variables</legend>
            <p className="text-xs text-muted-foreground">Send contact details to the agent (e.g. so it can greet by name). Names must exactly match variables defined on your Sarvam agent — Sarvam rejects unknown ones. Remove all rows if your agent has none.</p>
            {variables.map((row, index) => (
              <div key={index} className="flex items-center gap-2">
                <Input aria-label="Agent variable name" value={row.name} placeholder="variable_name" className="rounded-xl font-mono text-sm"
                  onChange={(event) => setVariables((current) => current.map((item, position) => (position === index ? { ...item, name: event.target.value } : item)))} />
                <span className="text-muted-foreground">←</span>
                <Select value={row.source} onValueChange={(value) => setVariables((current) => current.map((item, position) => (position === index ? { ...item, source: value as VariableSource } : item)))}>
                  <SelectTrigger className="rounded-xl" aria-label="Contact field"><SelectValue /></SelectTrigger>
                  <SelectContent>{sourceOptions.map((option) => <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>)}</SelectContent>
                </Select>
                <Button size="icon" variant="ghost" aria-label="Remove variable" onClick={() => setVariables((current) => current.filter((_, position) => position !== index))}><Trash2 /></Button>
              </div>
            ))}
            <Button size="sm" variant="outline" onClick={() => setVariables((current) => [...current, { name: "", source: "first_name" }])}><Plus /> Add variable</Button>
            {variableError && <p className="text-xs text-destructive">{variableError}</p>}
          </fieldset>

          <Field label="Notes"><Textarea value={form.notes} onChange={(event) => set("notes", event.target.value)} className="rounded-xl" /></Field>

          <label className="flex items-start gap-2 rounded-xl border border-primary/30 bg-accent/40 p-3 text-sm">
            <Checkbox checked={consent} onCheckedChange={(checked) => setConsent(checked === true)} className="mt-0.5" />
            <span>I confirm everyone in <b>{project?.name ?? "this project"}</b> agreed to be contacted, numbers on the DND registry have been removed where required, and the agent announces it is an AI and that calls are recorded.</span>
          </label>
        </div>

        <DialogFooter>
          <Button variant="ghost" disabled={save.isPending} onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button variant="outline" disabled={!valid || save.isPending} onClick={() => save.mutate(false)}><Save /> Save draft</Button>
          <Button variant="hero" disabled={!valid || !consent || !agentReady || save.isPending} onClick={() => save.mutate(true)}>
            {save.isPending ? <Loader2 className="animate-spin" /> : <Rocket />} Save & launch
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="space-y-1.5"><Label>{label}</Label>{children}</div>;
}
