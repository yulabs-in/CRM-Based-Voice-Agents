import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Megaphone, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { PageHeader } from "@/components/app/PageHeader";
import { StatusBadge } from "@/components/app/StatusBadge";
import { CampaignBuilder } from "@/components/app/CampaignBuilder";
import { CampaignControls, outsideCallingHours } from "@/components/app/CampaignControls";
import { KpiGrid } from "@/components/app/charts";
import { supabase } from "@/lib/supabase";
import { canWrite, useOrg } from "@/lib/org";
import { shortDate } from "@/lib/format";
import { pageHead } from "@/lib/seo";
import { fetchAll } from "@/lib/fetch-all";
import { campaignComparison, type CallRow, type TargetRow } from "@/lib/call-insights";

export const Route = createFileRoute("/_authenticated/_app/call-campaigns/")({
  validateSearch: (s: Record<string, unknown>): { new?: boolean; projectId?: string } => ({
    new: s.new === true || s.new === "true" ? true : undefined,
    projectId: typeof s.projectId === "string" ? s.projectId : undefined,
  }),
  head: () => pageHead("Call Campaigns", "Call every contact in a project with a Sarvam voice agent."),
  component: Page,
});

function Page() {
  const search = Route.useSearch();
  const navigate = useNavigate();
  const { org, role } = useOrg();

  const data = useQuery({
    queryKey: ["campaigns", org.id, "list"],
    refetchInterval: 20000,
    queryFn: async () => {
      const [campaigns, projects, agents] = await Promise.all([
        supabase.from("call_campaigns").select("id, name, status, project_id, agent_id, target_count, created_at, launched_at, last_error, consent_confirmed, allowed_start_time, allowed_end_time, allowed_days, timezone").eq("organization_id", org.id).order("created_at", { ascending: false }),
        supabase.from("projects").select("id, name").eq("organization_id", org.id),
        supabase.from("voice_agents").select("id, name").eq("organization_id", org.id),
      ]);
      if (campaigns.error) throw campaigns.error;
      const [targets, calls] = await Promise.all([
        fetchAll<TargetRow>((from, to) => supabase.from("campaign_targets").select("campaign_id, status").eq("organization_id", org.id).range(from, to), 200000),
        fetchAll<CallRow>((from, to) => supabase.from("calls").select("id, status, duration_seconds, sentiment, outcome, campaign_id, agent_id, contact_id, started_at, created_at, answers").eq("organization_id", org.id).not("campaign_id", "is", null).range(from, to), 200000),
      ]);
      return {
        campaigns: campaigns.data ?? [],
        rows: campaignComparison(campaigns.data ?? [], targets, calls),
        projects: new Map((projects.data ?? []).map((project) => [project.id, project.name])),
        agents: new Map((agents.data ?? []).map((agent) => [agent.id, agent.name])),
        totals: { calls: calls.length, connected: calls.filter((call) => call.status === "completed").length, positive: calls.filter((call) => call.sentiment === "positive").length },
      };
    },
  });

  const rows = data.data?.rows ?? [];
  const meta = new Map((data.data?.campaigns ?? []).map((campaign) => [campaign.id, campaign]));
  const close = () => navigate({ to: "/call-campaigns", search: {} });

  return (
    <div className="animate-rise space-y-5">
      <PageHeader title="Call Campaigns" description="Pick a project, pick a voice agent, and Sarvam calls everyone in it — answers, transcripts and recordings come back to each contact.">
        {canWrite(role) && <Button variant="hero" onClick={() => navigate({ to: "/call-campaigns", search: { new: true } })}><Plus /> New campaign</Button>}
      </PageHeader>

      <KpiGrid loading={data.isLoading} items={[
        { label: "Campaigns", value: rows.length, hint: `${rows.filter((row) => row.status === "running").length} running` },
        { label: "Campaign calls", value: (data.data?.totals.calls ?? 0).toLocaleString() },
        { label: "Connected", value: (data.data?.totals.connected ?? 0).toLocaleString() },
        { label: "Positive outcomes", value: (data.data?.totals.positive ?? 0).toLocaleString() },
      ]} />

      <div className="overflow-x-auto rounded-2xl border bg-card shadow-soft">
        {data.isLoading ? <div className="space-y-2 p-4">{Array.from({ length: 4 }, (_, index) => <Skeleton key={index} className="h-10" />)}</div> : !rows.length ? (
          <div className="dot-canvas m-3 rounded-xl border border-dashed py-16 text-center">
            <span className="mx-auto grid size-12 place-items-center rounded-2xl bg-accent text-accent-foreground"><Megaphone /></span>
            <p className="mt-4 font-semibold">No campaigns yet</p>
            <p className="mt-1 text-sm text-muted-foreground">Import a project of contacts, then run a campaign on it.</p>
            {canWrite(role) && <Button variant="hero" className="mt-5" onClick={() => navigate({ to: "/call-campaigns", search: { new: true } })}><Plus /> New campaign</Button>}
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead><tr className="border-b text-left text-xs uppercase tracking-wide text-muted-foreground">
              <th className="px-4 py-2.5">Campaign</th><th className="px-4 py-2.5">Project</th><th className="px-4 py-2.5">Agent</th><th className="px-4 py-2.5">Status</th>
              <th className="px-4 py-2.5">Progress</th><th className="px-4 py-2.5">Connected</th><th className="px-4 py-2.5">Positive</th><th className="px-4 py-2.5">Created</th><th className="px-4 py-2.5">Actions</th>
            </tr></thead>
            <tbody>
              {rows.map((row) => {
                const campaign = meta.get(row.id)!;
                return (
                  <tr key={row.id} className="border-b last:border-0 hover:bg-muted/60">
                    <td className="px-4 py-3"><Link to="/call-campaigns/$campaignId" params={{ campaignId: row.id }} className="font-semibold hover:text-primary">{row.name}</Link>
                      {campaign.last_error && <p className="max-w-64 truncate text-xs text-destructive" title={campaign.last_error}>{campaign.last_error}</p>}</td>
                    <td className="px-4 py-3">{campaign.project_id ? <Link to="/projects/$projectId" params={{ projectId: campaign.project_id }} className="hover:text-primary">{data.data?.projects.get(campaign.project_id) ?? "—"}</Link> : "—"}</td>
                    <td className="px-4 py-3">{data.data?.agents.get(String(campaign.agent_id)) ?? "—"}</td>
                    <td className="px-4 py-3"><StatusBadge value={row.status} />{["running", "scheduled", "launching"].includes(row.status) && outsideCallingHours(campaign) && <p className="mt-1 text-[11px] text-warning">Outside calling hours</p>}</td>
                    <td className="px-4 py-3"><div className="flex items-center gap-2"><div className="h-2 w-24 overflow-hidden rounded-full bg-muted"><div className="h-full bg-primary" style={{ width: `${row.progress}%` }} /></div><span className="text-xs tabular-nums text-muted-foreground">{row.progress}% of {row.contacts.toLocaleString()}</span></div></td>
                    <td className="px-4 py-3 tabular-nums">{row.connected.toLocaleString()} <span className="text-xs text-muted-foreground">({row.rate}%)</span></td>
                    <td className="px-4 py-3 tabular-nums">{row.positive.toLocaleString()}</td>
                    <td className="px-4 py-3 text-muted-foreground">{shortDate(campaign.created_at)}</td>
                    <td className="px-4 py-3"><CampaignControls campaign={campaign} compact /></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      <CampaignBuilder open={!!search.new} onOpenChange={(open) => !open && void close()} projectId={search.projectId}
        onSaved={(campaignId) => void navigate({ to: "/call-campaigns/$campaignId", params: { campaignId } })} />
    </div>
  );
}
