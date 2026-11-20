// Server-only automation engine. Runs active workflows for an event with the service client.
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { asAnswers } from "@/lib/sarvam-call";
import { callbackTime, rulesMatch, type Action, type AutomationEvent, type Condition, type EventFacts } from "@/lib/automation";

export type AutomationContext = {
  organizationId: string;
  event: AutomationEvent;
  callId?: string | null;
  contactId?: string | null;
  campaignId?: string | null;
  facts?: EventFacts;
};

type ContactRow = { id: string; first_name: string; last_name: string | null; phone: string | null; email: string | null; project_id: string | null; tags: string[] };
type ActionResult = { action: string; ok: boolean; detail: string };

const fullName = (contact: ContactRow | null) => (contact ? `${contact.first_name} ${contact.last_name ?? ""}`.trim() : "");
const fill = (text: string, contact: ContactRow | null, facts: EventFacts) =>
  text.replace(/\{(name|phone|disposition|summary)\}/g, (_m, key: string) => {
    const answers = asAnswers(facts.answers);
    if (key === "name") return fullName(contact) || contact?.phone || "contact";
    if (key === "phone") return contact?.phone ?? "";
    if (key === "disposition") return answers.disposition ?? facts.outcome ?? "";
    return answers.call_summary ?? "";
  });

async function runAction(action: Action, ctx: AutomationContext, contact: ContactRow | null): Promise<ActionResult> {
  const facts = ctx.facts ?? {};
  const answers = asAnswers(facts.answers);
  const org = ctx.organizationId;
  const needContact = (): ContactRow => {
    if (!contact) throw new Error("This event has no contact");
    return contact;
  };
  switch (action.type) {
    case "create_task": {
      const due = action.due_in_hours ? new Date(Date.now() + action.due_in_hours * 3600_000).toISOString() : null;
      const { error } = await supabaseAdmin.from("tasks").insert({
        organization_id: org, title: fill(action.title || "Follow up with {name}", contact, facts).slice(0, 200),
        description: answers.call_summary ?? null, due_at: due, priority: action.priority ?? "medium", status: "open", contact_id: contact?.id ?? null,
        assignee_id: null, created_by: null,
      });
      if (error) throw new Error(error.message);
      return { action: action.type, ok: true, detail: "Task created" };
    }
    case "create_lead": {
      const c = needContact();
      const { data: existing } = await supabaseAdmin.from("leads").select("id").eq("organization_id", org).eq("contact_id", c.id).limit(1).maybeSingle();
      if (existing) return { action: action.type, ok: true, detail: "Lead already exists" };
      const { error } = await supabaseAdmin.from("leads").insert({
        organization_id: org, contact_id: c.id, name: fullName(c) || c.phone || "Lead", phone: c.phone, email: c.email,
        status: action.status ?? "new", source: "AI call", score: action.score ?? (facts.sentiment === "positive" ? 70 : 40), owner_id: null,
      });
      if (error) throw new Error(error.message);
      return { action: action.type, ok: true, detail: "Lead created" };
    }
    case "create_deal": {
      const c = needContact();
      const { error } = await supabaseAdmin.from("deals").insert({
        organization_id: org, contact_id: c.id, title: fill(action.title || "{name} — from AI call", c, facts).slice(0, 200),
        stage: action.stage ?? "qualification", value: action.value ?? 0, owner_id: null,
      });
      if (error) throw new Error(error.message);
      return { action: action.type, ok: true, detail: "Deal created" };
    }
    case "tag_contact": {
      const c = needContact();
      const tag = action.tag.trim().slice(0, 40);
      if (!tag || c.tags.includes(tag)) return { action: action.type, ok: true, detail: "Already tagged" };
      const { error } = await supabaseAdmin.from("contacts").update({ tags: [...c.tags, tag] }).eq("id", c.id);
      if (error) throw new Error(error.message);
      c.tags = [...c.tags, tag];
      return { action: action.type, ok: true, detail: `Tagged "${tag}"` };
    }
    case "set_contact_status": {
      const c = needContact();
      const { error } = await supabaseAdmin.from("contacts").update({ status: action.status }).eq("id", c.id);
      if (error) throw new Error(error.message);
      return { action: action.type, ok: true, detail: `Contact marked ${action.status}` };
    }
    case "move_to_project": {
      const c = needContact();
      const { data: project } = await supabaseAdmin.from("projects").select("id").eq("id", action.project_id).eq("organization_id", org).maybeSingle();
      if (!project) throw new Error("Target project not found");
      const { error } = await supabaseAdmin.from("contacts").update({ project_id: project.id }).eq("id", c.id);
      if (error) {
        if (error.code === "23505") return { action: action.type, ok: true, detail: "Already in that project" };
        throw new Error(error.message);
      }
      return { action: action.type, ok: true, detail: "Moved to project" };
    }
    case "schedule_callback": {
      const c = needContact();
      return scheduleCallback(org, [c.id], action, ctx, fullName(c) || c.phone || "contact");
    }
  }
}

/** Creates and launches a small Sarvam campaign for specific contacts at a future time. */
async function scheduleCallback(org: string, contactIds: string[], action: Extract<Action, { type: "schedule_callback" }>, ctx: AutomationContext, label: string): Promise<ActionResult> {
  const { data: source } = ctx.campaignId
    ? await supabaseAdmin.from("call_campaigns").select("agent_id, allowed_start_time, allowed_end_time, allowed_days, timezone, agent_variables, max_retries, retry_interval_minutes").eq("id", ctx.campaignId).maybeSingle()
    : { data: null };
  let agentId = action.agent_id ?? source?.agent_id ?? null;
  if (!agentId && ctx.callId) {
    const { data: call } = await supabaseAdmin.from("calls").select("agent_id").eq("id", ctx.callId).maybeSingle();
    agentId = call?.agent_id ?? null;
  }
  if (!agentId) {
    const { data: agent } = await supabaseAdmin.from("voice_agents").select("id").eq("organization_id", org).eq("status", "active").order("created_at").limit(1).maybeSingle();
    agentId = agent?.id ?? null;
  }
  if (!agentId) throw new Error("No active voice agent to place the callback");
  const when = callbackTime(action);
  const { data: campaign, error } = await supabaseAdmin.from("call_campaigns").insert({
    organization_id: org, name: `Callback · ${label}`.slice(0, 100), agent_id: agentId, contact_ids: contactIds, source: "automation",
    status: "draft", starts_at: when.toISOString(), consent_confirmed: true,
    allowed_start_time: source?.allowed_start_time ?? "09:00", allowed_end_time: source?.allowed_end_time ?? "21:00",
    allowed_days: source?.allowed_days ?? ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"],
    timezone: source?.timezone ?? "Asia/Kolkata", agent_variables: source?.agent_variables ?? { customer_name: "full_name" },
    max_retries: source?.max_retries ?? 1, retry_interval_minutes: source?.retry_interval_minutes ?? 60, target_count: contactIds.length,
    notes: ctx.callId ? `Scheduled by automation after call ${ctx.callId}` : "Scheduled by automation",
  }).select("id").single();
  if (error || !campaign) throw new Error(error?.message ?? "Could not create the callback campaign");
  const { runCampaignLaunch } = await import("@/lib/campaigns.server");
  await runCampaignLaunch(supabaseAdmin, campaign.id);
  return { action: action.type, ok: true, detail: `Callback scheduled for ${when.toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })}` };
}

/** Runs every matching active workflow for one event. Never throws — failures are logged per run. */
export async function runAutomations(ctx: AutomationContext): Promise<{ ran: number }> {
  try {
    let contact: ContactRow | null = null;
    if (ctx.contactId) {
      const { data } = await supabaseAdmin.from("contacts").select("id, first_name, last_name, phone, email, project_id, tags").eq("id", ctx.contactId).maybeSingle();
      contact = data as ContactRow | null;
    }
    const { data: workflows } = await supabaseAdmin.from("workflows")
      .select("id, name, trigger, conditions, match, actions, project_id, campaign_id, run_count")
      .eq("organization_id", ctx.organizationId).eq("status", "active").eq("trigger->>event", ctx.event);
    let ran = 0;
    for (const workflow of workflows ?? []) {
      if (workflow.project_id && workflow.project_id !== contact?.project_id) continue;
      if (workflow.campaign_id && workflow.campaign_id !== ctx.campaignId) continue;
      const conditions = (Array.isArray(workflow.conditions) ? workflow.conditions : []) as Condition[];
      if (!rulesMatch(conditions, workflow.match === "any" ? "any" : "all", ctx.facts ?? {})) continue;
      // Claim the run first so a retried webhook can't repeat the actions.
      const { data: run, error: claimError } = await supabaseAdmin.from("workflow_runs").insert({
        organization_id: ctx.organizationId, workflow_id: workflow.id, event: ctx.event, call_id: ctx.callId ?? null,
        contact_id: ctx.contactId ?? null, campaign_id: ctx.campaignId ?? null, status: "success",
      }).select("id").single();
      if (claimError || !run) continue;
      const results: ActionResult[] = [];
      for (const action of (Array.isArray(workflow.actions) ? workflow.actions : []) as Action[]) {
        try {
          results.push(await runAction(action, ctx, contact));
        } catch (error) {
          results.push({ action: action.type, ok: false, detail: error instanceof Error ? error.message : "Failed" });
        }
      }
      const failed = results.filter((result) => !result.ok).length;
      await supabaseAdmin.from("workflow_runs").update({
        results, status: !results.length ? "skipped" : failed === 0 ? "success" : failed === results.length ? "failed" : "partial",
        error: failed ? results.filter((r) => !r.ok).map((r) => r.detail).join("; ").slice(0, 500) : null,
      }).eq("id", run.id);
      await supabaseAdmin.from("workflows").update({ run_count: workflow.run_count + 1, last_run_at: new Date().toISOString() }).eq("id", workflow.id);
      ran += 1;
    }
    return { ran };
  } catch (error) {
    console.error("[automation] run failed", error);
    return { ran: 0 };
  }
}

/** contact.imported: runs per imported contact; a schedule_callback action becomes ONE campaign for all of them. */
export async function runImportAutomations(organizationId: string, projectId: string, contactIds: string[]): Promise<{ ran: number }> {
  const { data: workflows } = await supabaseAdmin.from("workflows")
    .select("id, actions, project_id, conditions, match, run_count").eq("organization_id", organizationId).eq("status", "active").eq("trigger->>event", "contact.imported");
  let ran = 0;
  for (const workflow of workflows ?? []) {
    if (workflow.project_id && workflow.project_id !== projectId) continue;
    const actions = (Array.isArray(workflow.actions) ? workflow.actions : []) as Action[];
    const results: ActionResult[] = [];
    for (const action of actions) {
      try {
        if (action.type === "schedule_callback") {
          results.push(await scheduleCallback(organizationId, contactIds.slice(0, 5000), action, { organizationId, event: "contact.imported" }, "new imports"));
        } else {
          let ok = 0;
          for (const contactId of contactIds.slice(0, 500)) {
            const { data: contact } = await supabaseAdmin.from("contacts").select("id, first_name, last_name, phone, email, project_id, tags").eq("id", contactId).maybeSingle();
            await runAction(action, { organizationId, event: "contact.imported", contactId }, contact as ContactRow | null).then(() => { ok += 1; }).catch(() => undefined);
          }
          results.push({ action: action.type, ok: ok > 0 || !contactIds.length, detail: `${ok}/${Math.min(contactIds.length, 500)} contacts` });
        }
      } catch (error) {
        results.push({ action: action.type, ok: false, detail: error instanceof Error ? error.message : "Failed" });
      }
    }
    const failed = results.filter((r) => !r.ok).length;
    await supabaseAdmin.from("workflow_runs").insert({
      organization_id: organizationId, workflow_id: workflow.id, event: "contact.imported", results,
      status: failed === 0 ? "success" : failed === results.length ? "failed" : "partial",
    });
    await supabaseAdmin.from("workflows").update({ run_count: workflow.run_count + 1, last_run_at: new Date().toISOString() }).eq("id", workflow.id);
    ran += 1;
  }
  return { ran };
}
