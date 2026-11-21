import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ArrowDown, FlaskConical, Loader2, Plus, Save, Trash2, Zap } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { supabase } from "@/lib/supabase";
import { useOrg } from "@/lib/org";
import { asAnswers, humanize } from "@/lib/sarvam-call";
import { ACTIONS, EVENTS, FIELDS, OPERATORS, type Action, type ActionType, type AutomationEvent, type Condition } from "@/lib/automation";
import { testWorkflowOnCall } from "@/lib/automation.functions";

export type WorkflowDraft = {
  id?: string; name: string; event: AutomationEvent; conditions: Condition[]; match: "all" | "any"; actions: Action[];
  project_id: string | null; campaign_id: string | null; active: boolean; kind?: string;
};

export const EMPTY_WORKFLOW: WorkflowDraft = {
  name: "", event: "call.completed", conditions: [{ field: "disposition", operator: "equals", value: "interested" }], match: "all",
  actions: [{ type: "create_task", title: "Follow up with {name}", due_in_hours: 24 }], project_id: null, campaign_id: null, active: true,
};

const NONE = "__none";
const defaultAction = (type: ActionType): Action => {
  switch (type) {
    case "create_task": return { type, title: "Follow up with {name}", due_in_hours: 24, priority: "medium" };
    case "create_lead": return { type, status: "new" };
    case "create_deal": return { type, stage: "qualification", value: 0 };
    case "tag_contact": return { type, tag: "hot" };
    case "set_contact_status": return { type, status: "inactive" };
    case "move_to_project": return { type, project_id: "" };
    case "schedule_callback": return { type, delay_hours: 24 };
  }
};

/** Create or edit one workflow: WHEN (trigger) → IF (rules) → THEN (actions). */
export function WorkflowBuilder({ open, onOpenChange, initial }: { open: boolean; onOpenChange: (open: boolean) => void; initial: WorkflowDraft }) {
  const { org } = useOrg();
  const qc = useQueryClient();
  const test = useServerFn(testWorkflowOnCall);
  const [draft, setDraft] = useState<WorkflowDraft>(initial);
  const [testCall, setTestCall] = useState<string>("");
  const [testResult, setTestResult] = useState<{ matched: boolean; checks: Array<{ rule: string; ok: boolean }> } | null>(null);
  useEffect(() => { if (open) { setDraft(initial); setTestResult(null); } }, [open, initial]);
  const set = <K extends keyof WorkflowDraft>(key: K, value: WorkflowDraft[K]) => setDraft((d) => ({ ...d, [key]: value }));

  const options = useQuery({
    queryKey: ["workflow-builder", org.id],
    enabled: open,
    queryFn: async () => {
      const [projects, campaigns, agents, calls] = await Promise.all([
        supabase.from("projects").select("id, name").eq("organization_id", org.id).order("created_at", { ascending: false }),
        supabase.from("call_campaigns").select("id, name").eq("organization_id", org.id).order("created_at", { ascending: false }).limit(100),
        supabase.from("voice_agents").select("id, name").eq("organization_id", org.id).eq("status", "active"),
        supabase.from("calls").select("id, phone, status, answers, created_at, contact:contacts(first_name)").eq("organization_id", org.id).eq("status", "completed").order("created_at", { ascending: false }).limit(30),
      ]);
      const keys = new Map<string, Set<string>>();
      for (const call of calls.data ?? []) for (const [key, value] of Object.entries(asAnswers(call.answers))) {
        if (value.length > 40) { keys.set(key, keys.get(key) ?? new Set()); continue; }
        keys.set(key, (keys.get(key) ?? new Set()).add(value));
      }
      return { projects: projects.data ?? [], campaigns: campaigns.data ?? [], agents: agents.data ?? [], calls: (calls.data ?? []) as unknown as Array<{ id: string; phone: string | null; created_at: string; contact: { first_name: string } | null }>, answerKeys: keys };
    },
  });

  const fieldOptions = useMemo(() => [
    ...FIELDS,
    ...[...(options.data?.answerKeys.keys() ?? [])].filter((key) => key !== "disposition").map((key) => ({ value: `answer.${key}` as const, label: `Answer: ${humanize(key)}` })),
  ], [options.data]);
  const isCallEvent = draft.event.startsWith("call.");

  const save = useMutation({
    mutationFn: async () => {
      if (!draft.name.trim()) throw new Error("Give the workflow a name");
      if (!draft.actions.length) throw new Error("Add at least one action");
      if (draft.actions.some((a) => a.type === "move_to_project" && !a.project_id)) throw new Error("Choose the project to move contacts to");
      const row = {
        organization_id: org.id, name: draft.name.trim(), kind: draft.kind ?? "workflow", status: draft.active ? "active" : "paused",
        trigger: { event: draft.event }, trigger_event: draft.event, conditions: isCallEvent ? draft.conditions : [], match: draft.match,
        actions: draft.actions, project_id: draft.project_id, campaign_id: draft.campaign_id,
      };
      const { error } = draft.id
        ? await supabase.from("workflows").update(row as never).eq("id", draft.id)
        : await supabase.from("workflows").insert(row as never);
      if (error) throw new Error(error.message);
    },
    onSuccess: () => { toast.success(draft.id ? "Workflow updated" : "Workflow created"); void qc.invalidateQueries({ queryKey: ["workflows"] }); onOpenChange(false); },
    onError: (error) => toast.error(error.message),
  });
  const runTest = useMutation({
    mutationFn: () => test({ data: { callId: testCall, conditions: draft.conditions, match: draft.match } }),
    onSuccess: setTestResult,
    onError: (error) => toast.error(error.message),
  });

  const updateCondition = (index: number, patch: Partial<Condition>) => set("conditions", draft.conditions.map((c, i) => (i === index ? { ...c, ...patch } : c)));
  const updateAction = (index: number, next: Action) => set("actions", draft.actions.map((a, i) => (i === index ? next : a)));

  return (
    <Dialog open={open} onOpenChange={(next) => !save.isPending && onOpenChange(next)}>
      <DialogContent className="max-h-[92vh] max-w-[calc(100vw-1.5rem)] overflow-y-auto rounded-2xl sm:max-w-2xl [&>*]:min-w-0">
        <DialogHeader>
          <DialogTitle>{draft.id ? "Edit workflow" : "New workflow"}</DialogTitle>
          <DialogDescription>When something happens, check your rules, then do the actions — automatically, on the server.</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
            <div className="space-y-1.5"><Label htmlFor="wf-name">Name</Label><Input id="wf-name" value={draft.name} maxLength={100} placeholder="e.g. Interested → lead + task" onChange={(e) => set("name", e.target.value)} className="rounded-xl" /></div>
            <label className="flex items-center gap-2 pb-2 text-sm"><Switch checked={draft.active} onCheckedChange={(v) => set("active", v)} /> Active</label>
          </div>

          <Step n={1} title="WHEN — trigger">
            <Select value={draft.event} onValueChange={(v) => set("event", v as AutomationEvent)}>
              <SelectTrigger className="rounded-xl" aria-label="Trigger"><SelectValue /></SelectTrigger>
              <SelectContent>{EVENTS.map((e) => <SelectItem key={e.value} value={e.value}>{e.label}</SelectItem>)}</SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">{EVENTS.find((e) => e.value === draft.event)?.help}</p>
            <div className="grid gap-3 sm:grid-cols-2">
              <ScopeSelect label="Only for project" value={draft.project_id} onChange={(v) => set("project_id", v)} items={options.data?.projects ?? []} />
              {draft.event !== "contact.imported" && <ScopeSelect label="Only for campaign" value={draft.campaign_id} onChange={(v) => set("campaign_id", v)} items={options.data?.campaigns ?? []} />}
            </div>
          </Step>

          {isCallEvent && (
            <Step n={2} title="IF — rules">
              <div className="flex items-center gap-2 text-sm">
                Match
                <Select value={draft.match} onValueChange={(v) => set("match", v as "all" | "any")}>
                  <SelectTrigger className="h-8 w-24 rounded-lg" aria-label="Match"><SelectValue /></SelectTrigger>
                  <SelectContent><SelectItem value="all">all</SelectItem><SelectItem value="any">any</SelectItem></SelectContent>
                </Select>
                of these rules {draft.conditions.length === 0 && <span className="text-muted-foreground">(no rules = every call)</span>}
              </div>
              {draft.conditions.map((condition, index) => {
                const op = OPERATORS.find((o) => o.value === condition.operator);
                const key = condition.field === "disposition" ? "disposition" : condition.field.startsWith("answer.") ? condition.field.slice(7) : null;
                const suggestions = key ? [...(options.data?.answerKeys.get(key) ?? [])] : condition.field === "sentiment" ? ["positive", "neutral", "negative"] : condition.field === "status" ? ["completed", "no_answer", "failed"] : [];
                return (
                  <div key={index} className="grid gap-2 sm:grid-cols-[1.3fr_1fr_1.2fr_auto]">
                    <Select value={condition.field} onValueChange={(v) => updateCondition(index, { field: v as Condition["field"] })}>
                      <SelectTrigger className="rounded-xl" aria-label="Field"><SelectValue /></SelectTrigger>
                      <SelectContent>{fieldOptions.map((f) => <SelectItem key={f.value} value={f.value}>{f.label}</SelectItem>)}</SelectContent>
                    </Select>
                    <Select value={condition.operator} onValueChange={(v) => updateCondition(index, { operator: v as Condition["operator"] })}>
                      <SelectTrigger className="rounded-xl" aria-label="Operator"><SelectValue /></SelectTrigger>
                      <SelectContent>{OPERATORS.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}</SelectContent>
                    </Select>
                    {op?.needsValue ? (
                      <>
                        <Input list={`wf-sugg-${index}`} value={condition.value ?? ""} onChange={(e) => updateCondition(index, { value: e.target.value })} placeholder="value" className="rounded-xl" aria-label="Value" />
                        <datalist id={`wf-sugg-${index}`}>{suggestions.map((s) => <option key={s} value={s} />)}</datalist>
                      </>
                    ) : <span />}
                    <Button size="icon" variant="ghost" aria-label="Remove rule" onClick={() => set("conditions", draft.conditions.filter((_, i) => i !== index))}><Trash2 /></Button>
                  </div>
                );
              })}
              <Button size="sm" variant="outline" onClick={() => set("conditions", [...draft.conditions, { field: "disposition", operator: "equals", value: "" }])}><Plus /> Add rule</Button>

              {!!options.data?.calls.length && (
                <div className="flex flex-wrap items-center gap-2 rounded-xl bg-muted/50 p-2 text-sm">
                  <FlaskConical className="size-4 text-muted-foreground" />
                  <Select value={testCall || NONE} onValueChange={(v) => { setTestCall(v === NONE ? "" : v); setTestResult(null); }}>
                    <SelectTrigger className="h-8 w-56 rounded-lg" aria-label="Test on call"><SelectValue placeholder="Test on a recent call" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value={NONE}>Test on a recent call…</SelectItem>
                      {options.data.calls.map((c) => <SelectItem key={c.id} value={c.id}>{c.contact?.first_name ?? c.phone} · {new Date(c.created_at).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  <Button size="sm" variant="outline" disabled={!testCall || runTest.isPending} onClick={() => runTest.mutate()}>{runTest.isPending && <Loader2 className="animate-spin" />} Test</Button>
                  {testResult && <span className={testResult.matched ? "font-semibold text-success" : "font-semibold text-destructive"}>{testResult.matched ? "✓ Would run" : "✗ Would not run"}</span>}
                  {testResult && <ul className="w-full space-y-0.5 text-xs">{testResult.checks.map((c, i) => <li key={i} className={c.ok ? "text-success" : "text-muted-foreground"}>{c.ok ? "✓" : "✗"} {c.rule}</li>)}</ul>}
                </div>
              )}
            </Step>
          )}

          <Step n={isCallEvent ? 3 : 2} title="THEN — actions">
            {draft.actions.map((action, index) => (
              <div key={index} className="space-y-2 rounded-xl border p-3">
                <div className="flex items-center gap-2">
                  <Select value={action.type} onValueChange={(v) => updateAction(index, defaultAction(v as ActionType))}>
                    <SelectTrigger className="rounded-xl" aria-label="Action"><SelectValue /></SelectTrigger>
                    <SelectContent>{ACTIONS.map((a) => <SelectItem key={a.value} value={a.value}>{a.label}</SelectItem>)}</SelectContent>
                  </Select>
                  <Button size="icon" variant="ghost" aria-label="Remove action" onClick={() => set("actions", draft.actions.filter((_, i) => i !== index))}><Trash2 /></Button>
                </div>
                <ActionFields action={action} onChange={(next) => updateAction(index, next)} projects={options.data?.projects ?? []} agents={options.data?.agents ?? []} />
              </div>
            ))}
            <Button size="sm" variant="outline" onClick={() => set("actions", [...draft.actions, defaultAction("create_task")])}><Plus /> Add action</Button>
            <p className="text-xs text-muted-foreground">In text you can use {"{name}"}, {"{phone}"}, {"{disposition}"} and {"{summary}"}.</p>
          </Step>
        </div>

        <DialogFooter>
          <Button variant="ghost" disabled={save.isPending} onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button variant="hero" disabled={save.isPending} onClick={() => save.mutate()}>{save.isPending ? <Loader2 className="animate-spin" /> : <Save />} Save workflow</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Step({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      {n > 1 && <ArrowDown className="mx-auto size-4 text-muted-foreground" />}
      <fieldset className="space-y-2 rounded-xl border p-3">
        <legend className="flex items-center gap-1.5 px-1 text-sm font-semibold"><Zap className="size-3.5 text-primary" />{n}. {title}</legend>
        {children}
      </fieldset>
    </div>
  );
}

function ScopeSelect({ label, value, onChange, items }: { label: string; value: string | null; onChange: (v: string | null) => void; items: Array<{ id: string; name: string }> }) {
  return (
    <div className="space-y-1">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      <Select value={value ?? NONE} onValueChange={(v) => onChange(v === NONE ? null : v)}>
        <SelectTrigger className="h-9 rounded-xl" aria-label={label}><SelectValue /></SelectTrigger>
        <SelectContent><SelectItem value={NONE}>Any</SelectItem>{items.map((i) => <SelectItem key={i.id} value={i.id}>{i.name}</SelectItem>)}</SelectContent>
      </Select>
    </div>
  );
}

function ActionFields({ action, onChange, projects, agents }: { action: Action; onChange: (a: Action) => void; projects: Array<{ id: string; name: string }>; agents: Array<{ id: string; name: string }> }) {
  const num = (value: string) => (value === "" ? undefined : Number(value));
  switch (action.type) {
    case "create_task":
      return (
        <div className="grid gap-2 sm:grid-cols-[2fr_1fr_1fr]">
          <Input value={action.title} onChange={(e) => onChange({ ...action, title: e.target.value })} placeholder="Task title" className="rounded-xl" aria-label="Task title" />
          <Input type="number" min={0} value={action.due_in_hours ?? ""} onChange={(e) => onChange({ ...action, due_in_hours: num(e.target.value) })} placeholder="Due in hours" className="rounded-xl" aria-label="Due in hours" />
          <Select value={action.priority ?? "medium"} onValueChange={(v) => onChange({ ...action, priority: v as "low" | "medium" | "high" })}>
            <SelectTrigger className="rounded-xl" aria-label="Priority"><SelectValue /></SelectTrigger>
            <SelectContent>{["low", "medium", "high"].map((p) => <SelectItem key={p} value={p}>{humanize(p)} priority</SelectItem>)}</SelectContent>
          </Select>
        </div>
      );
    case "create_lead":
      return <Input value={action.status ?? ""} onChange={(e) => onChange({ ...action, status: e.target.value })} placeholder="Lead status (e.g. new, qualified)" className="rounded-xl" aria-label="Lead status" />;
    case "create_deal":
      return (
        <div className="grid gap-2 sm:grid-cols-3">
          <Input value={action.title ?? ""} onChange={(e) => onChange({ ...action, title: e.target.value })} placeholder="{name} — from AI call" className="rounded-xl" aria-label="Deal title" />
          <Select value={action.stage ?? "qualification"} onValueChange={(v) => onChange({ ...action, stage: v })}>
            <SelectTrigger className="rounded-xl" aria-label="Stage"><SelectValue /></SelectTrigger>
            <SelectContent>{["qualification", "proposal", "negotiation", "won"].map((s) => <SelectItem key={s} value={s}>{humanize(s)}</SelectItem>)}</SelectContent>
          </Select>
          <Input type="number" min={0} value={action.value ?? ""} onChange={(e) => onChange({ ...action, value: num(e.target.value) })} placeholder="Value ₹" className="rounded-xl" aria-label="Deal value" />
        </div>
      );
    case "tag_contact":
      return <Input value={action.tag} onChange={(e) => onChange({ ...action, tag: e.target.value })} placeholder="Tag, e.g. hot" className="rounded-xl" aria-label="Tag" />;
    case "set_contact_status":
      return (
        <Select value={action.status} onValueChange={(v) => onChange({ ...action, status: v as "active" | "inactive" })}>
          <SelectTrigger className="rounded-xl" aria-label="Contact status"><SelectValue /></SelectTrigger>
          <SelectContent><SelectItem value="active">Active</SelectItem><SelectItem value="inactive">Inactive (don't call)</SelectItem></SelectContent>
        </Select>
      );
    case "move_to_project":
      return (
        <Select value={action.project_id || NONE} onValueChange={(v) => onChange({ ...action, project_id: v === NONE ? "" : v })}>
          <SelectTrigger className="rounded-xl" aria-label="Target project"><SelectValue placeholder="Choose project" /></SelectTrigger>
          <SelectContent><SelectItem value={NONE}>Choose project…</SelectItem>{projects.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}</SelectContent>
        </Select>
      );
    case "schedule_callback":
      return (
        <div className="grid gap-2 sm:grid-cols-3">
          <Input type="number" min={0.1} step={0.5} value={action.at_time ? "" : action.delay_hours ?? ""} disabled={!!action.at_time} onChange={(e) => onChange({ ...action, delay_hours: num(e.target.value) })} placeholder="In hours (e.g. 4)" className="rounded-xl" aria-label="Delay hours" />
          <Input type="time" value={action.at_time ?? ""} onChange={(e) => onChange({ ...action, at_time: e.target.value || undefined })} className="rounded-xl" aria-label="Or at time" title="Or at a fixed time (next occurrence)" />
          <Select value={action.agent_id ?? NONE} onValueChange={(v) => onChange({ ...action, agent_id: v === NONE ? undefined : v })}>
            <SelectTrigger className="rounded-xl" aria-label="Agent"><SelectValue /></SelectTrigger>
            <SelectContent><SelectItem value={NONE}>Same agent</SelectItem>{agents.map((a) => <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}</SelectContent>
          </Select>
        </div>
      );
  }
}
