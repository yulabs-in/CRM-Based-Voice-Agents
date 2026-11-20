import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, Pencil, Plus, Trash2, Workflow as WorkflowIcon, XCircle, Zap } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { StatusBadge } from "@/components/app/StatusBadge";
import { EMPTY_WORKFLOW, WorkflowBuilder, type WorkflowDraft } from "@/components/app/WorkflowBuilder";
import { supabase } from "@/integrations/supabase/client";
import { canDelete, canWrite, useOrg } from "@/lib/org";
import { describeAction, describeCondition, EVENTS, type Action, type AutomationEvent, type Condition } from "@/lib/automation";

export type WorkflowRow = {
  id: string; name: string; kind: string; status: string; trigger: { event?: AutomationEvent } | null; conditions: Condition[]; match: string;
  actions: Action[]; project_id: string | null; campaign_id: string | null; run_count: number; last_run_at: string | null; created_at: string;
};

export const TEMPLATES: Array<{ title: string; help: string; draft: Omit<WorkflowDraft, "active"> }> = [
  { title: "Interested → lead + follow-up task", help: "Hot prospects land in Leads with a task for tomorrow.", draft: {
    name: "Interested → lead + task", event: "call.completed", match: "any", project_id: null, campaign_id: null,
    // "equals", not "contains": otherwise "not_interested" would match "interested".
    conditions: [{ field: "disposition", operator: "equals", value: "interested" }, { field: "disposition", operator: "equals", value: "quote_requested" }, { field: "sentiment", operator: "equals", value: "positive" }],
    actions: [{ type: "create_lead", status: "qualified" }, { type: "create_task", title: "Call {name} — interested", due_in_hours: 24, priority: "high" }, { type: "tag_contact", tag: "hot" }] } },
  { title: "Callback requested → call again", help: "Sarvam calls them back automatically tomorrow at 11:00.", draft: {
    name: "Callback requested → call again", event: "call.completed", match: "any", project_id: null, campaign_id: null,
    conditions: [{ field: "disposition", operator: "contains", value: "callback" }],
    actions: [{ type: "schedule_callback", at_time: "11:00" }, { type: "create_task", title: "Callback booked for {name}", due_in_hours: 24 }] } },
  { title: "No answer → retry in 4 hours", help: "After Sarvam's retries, try once more later.", draft: {
    name: "No answer → retry in 4h", event: "call.not_connected", match: "all", project_id: null, campaign_id: null,
    conditions: [{ field: "status", operator: "equals", value: "no_answer" }],
    actions: [{ type: "schedule_callback", delay_hours: 4 }] } },
  { title: "Not interested / wrong number → stop calling", help: "Tag and mark inactive so they're not called again.", draft: {
    name: "Not interested → do not call", event: "call.completed", match: "any", project_id: null, campaign_id: null,
    conditions: [{ field: "disposition", operator: "contains", value: "not interested" }, { field: "disposition", operator: "contains", value: "wrong number" }, { field: "disposition", operator: "contains", value: "do not call" }],
    actions: [{ type: "tag_contact", tag: "do-not-call" }, { type: "set_contact_status", status: "inactive" }] } },
  { title: "New import → call within 10 minutes", help: "Every new file you import is called automatically.", draft: {
    name: "New import → auto-call", event: "contact.imported", match: "all", project_id: null, campaign_id: null, conditions: [],
    actions: [{ type: "schedule_callback", delay_hours: 0.17 }] } },
  { title: "Campaign finished → review task", help: "A task to review results when a campaign completes.", draft: {
    name: "Campaign done → review", event: "campaign.completed", match: "all", project_id: null, campaign_id: null, conditions: [],
    actions: [{ type: "create_task", title: "Review campaign results", due_in_hours: 2 }] } },
];

export function toDraft(row: WorkflowRow): WorkflowDraft {
  return {
    id: row.id, name: row.name, kind: row.kind, event: row.trigger?.event ?? "call.completed", conditions: row.conditions ?? [],
    match: row.match === "any" ? "any" : "all", actions: row.actions ?? [], project_id: row.project_id, campaign_id: row.campaign_id, active: row.status === "active",
  };
}

export function useWorkflows() {
  const { org } = useOrg();
  return useQuery({
    queryKey: ["workflows", org.id],
    queryFn: async () => {
      const [workflows, projects] = await Promise.all([
        supabase.from("workflows").select("id, name, kind, status, trigger, conditions, match, actions, project_id, campaign_id, run_count, last_run_at, created_at").eq("organization_id", org.id).order("created_at", { ascending: false }),
        supabase.from("projects").select("id, name").eq("organization_id", org.id),
      ]);
      if (workflows.error) throw workflows.error;
      return { workflows: (workflows.data ?? []) as unknown as WorkflowRow[], projects: new Map((projects.data ?? []).map((p) => [p.id, p.name])) };
    },
  });
}

/** Cards for workflows with on/off, edit and delete. `filter` narrows which ones show. */
export function WorkflowList({ filter, emptyText, onNew }: { filter?: (row: WorkflowRow) => boolean; emptyText: string; onNew?: (draft: WorkflowDraft) => void }) {
  const { role } = useOrg();
  const qc = useQueryClient();
  const list = useWorkflows();
  const [editing, setEditing] = useState<WorkflowDraft | null>(null);
  const toggle = useMutation({
    mutationFn: async (row: WorkflowRow) => {
      const { error } = await supabase.from("workflows").update({ status: row.status === "active" ? "paused" : "active" }).eq("id", row.id);
      if (error) throw error;
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["workflows"] }),
    onError: (e) => toast.error(e.message),
  });
  const remove = useMutation({
    mutationFn: async (id: string) => { const { error } = await supabase.from("workflows").delete().eq("id", id); if (error) throw error; },
    onSuccess: () => { toast.success("Workflow deleted"); void qc.invalidateQueries({ queryKey: ["workflows"] }); },
    onError: (e) => toast.error(e.message),
  });

  const rows = (list.data?.workflows ?? []).filter(filter ?? (() => true));
  if (list.isLoading) return <Skeleton className="h-32 rounded-2xl" />;
  return (
    <>
      {!rows.length ? (
        <div className="dot-canvas rounded-2xl border border-dashed py-12 text-center">
          <span className="mx-auto grid size-12 place-items-center rounded-2xl bg-accent text-accent-foreground"><WorkflowIcon /></span>
          <p className="mt-3 text-sm text-muted-foreground">{emptyText}</p>
          {onNew && canWrite(role) && <Button variant="hero" className="mt-4" onClick={() => onNew(EMPTY_WORKFLOW)}><Plus /> New workflow</Button>}
        </div>
      ) : (
        <div className="grid gap-3 lg:grid-cols-2">
          {rows.map((row) => (
            <div key={row.id} className="rounded-2xl border bg-card p-4 shadow-soft">
              <div className="flex items-start gap-2">
                <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-accent text-accent-foreground"><Zap className="size-4" /></span>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold">{row.name}</p>
                  <p className="text-xs text-muted-foreground">{row.run_count} run{row.run_count === 1 ? "" : "s"}{row.last_run_at ? ` · last ${new Date(row.last_run_at).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}` : ""}</p>
                </div>
                {canWrite(role) && <Switch checked={row.status === "active"} onCheckedChange={() => toggle.mutate(row)} aria-label={`Turn ${row.name} on or off`} />}
              </div>
              <dl className="mt-3 space-y-1.5 text-sm">
                <div><dt className="inline font-semibold text-primary">WHEN </dt><dd className="inline">{EVENTS.find((e) => e.value === row.trigger?.event)?.label ?? row.trigger?.event}{row.project_id ? ` · project ${list.data?.projects.get(row.project_id) ?? ""}` : ""}</dd></div>
                {!!row.conditions?.length && <div><dt className="inline font-semibold text-primary">IF </dt><dd className="inline">{row.conditions.map(describeCondition).join(row.match === "any" ? " OR " : " AND ")}</dd></div>}
                <div><dt className="inline font-semibold text-primary">THEN </dt><dd className="inline">{(row.actions ?? []).map((a) => describeAction(a, list.data?.projects)).join(" → ")}</dd></div>
              </dl>
              {canWrite(role) && (
                <div className="mt-3 flex justify-end gap-1">
                  <Button size="sm" variant="ghost" onClick={() => setEditing(toDraft(row))}><Pencil /> Edit</Button>
                  {canDelete(role) && <Button size="sm" variant="ghost" className="text-destructive" onClick={() => confirm(`Delete "${row.name}"?`) && remove.mutate(row.id)}><Trash2 /> Delete</Button>}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
      <WorkflowBuilder open={!!editing} onOpenChange={(open) => !open && setEditing(null)} initial={editing ?? EMPTY_WORKFLOW} />
    </>
  );
}

/** Recent automation runs (what fired, for whom, and what each action did). */
export function RunLog({ limit = 30 }: { limit?: number }) {
  const { org } = useOrg();
  const runs = useQuery({
    queryKey: ["workflows", org.id, "runs", limit],
    refetchInterval: 15000,
    queryFn: async () => {
      const { data, error } = await supabase.from("workflow_runs")
        .select("id, event, status, results, error, created_at, workflow:workflows(name), contact:contacts(first_name, last_name, phone)")
        .eq("organization_id", org.id).order("created_at", { ascending: false }).limit(limit);
      if (error) throw error;
      return (data ?? []) as unknown as Array<{ id: string; event: string; status: string; results: Array<{ action: string; ok: boolean; detail: string }>; error: string | null; created_at: string; workflow: { name: string } | null; contact: { first_name: string; last_name: string | null; phone: string | null } | null }>;
    },
  });
  if (runs.isLoading) return <Skeleton className="h-24 rounded-2xl" />;
  if (!runs.data?.length) return <p className="rounded-2xl border border-dashed p-6 text-center text-sm text-muted-foreground">No automation runs yet. They appear here as calls finish.</p>;
  return (
    <ul className="divide-y rounded-2xl border bg-card shadow-soft">
      {runs.data.map((run) => (
        <li key={run.id} className="space-y-1 p-3 text-sm">
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge value={run.status === "success" ? "completed" : run.status} />
            <span className="font-semibold">{run.workflow?.name ?? "Deleted workflow"}</span>
            <span className="text-xs text-muted-foreground">{EVENTS.find((e) => e.value === run.event)?.label ?? run.event}{run.contact ? ` · ${`${run.contact.first_name} ${run.contact.last_name ?? ""}`.trim() || run.contact.phone}` : ""}</span>
            <span className="ml-auto text-xs text-muted-foreground">{new Date(run.created_at).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</span>
          </div>
          <ul className="flex flex-wrap gap-x-4 gap-y-0.5 text-xs">
            {(run.results ?? []).map((result, i) => (
              <li key={i} className={result.ok ? "text-success" : "text-destructive"}>{result.ok ? <CheckCircle2 className="mr-1 inline size-3" /> : <XCircle className="mr-1 inline size-3" />}{result.detail}</li>
            ))}
          </ul>
        </li>
      ))}
    </ul>
  );
}
