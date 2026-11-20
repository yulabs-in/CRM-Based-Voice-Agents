import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Clock, PhoneCall, PhoneIncoming, Radio } from "lucide-react";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { PageHeader } from "@/components/app/PageHeader";
import { StatusBadge } from "@/components/app/StatusBadge";
import { AnswerChips } from "@/components/app/AnswerChips";
import { CallDetailSheet } from "@/components/app/CallDetailSheet";
import { CampaignControls, outsideCallingHours, type ControllableCampaign } from "@/components/app/CampaignControls";
import { KpiGrid } from "@/components/app/charts";
import { supabase } from "@/integrations/supabase/client";
import { useOrg } from "@/lib/org";
import { pageHead } from "@/lib/seo";
import { duration, pct } from "@/lib/call-insights";

export const Route = createFileRoute("/_authenticated/_app/live-calls")({
  head: () => pageHead("Live Calls", "Running campaigns, calls in progress and results as they arrive."),
  component: Page,
});

const OPEN = ["pending", "queued", "calling", "retrying"];
type LiveCampaign = ControllableCampaign & { project: { name: string } | null; agent: { name: string } | null; starts_at: string | null; target_count: number };
type FeedCall = {
  id: string; phone: string | null; status: string; sarvam_status: string | null; duration_seconds: number; answers: unknown; updated_at: string;
  campaign: { name: string } | null; contact: { first_name: string; last_name: string | null } | null;
};

function Page() {
  const { org } = useOrg();
  const [openCall, setOpenCall] = useState<string | null>(null);

  const live = useQuery({
    queryKey: ["live", org.id],
    refetchInterval: 5000,
    queryFn: async () => {
      const [campaigns, dialing, feed] = await Promise.all([
        supabase.from("call_campaigns")
          .select("id, name, status, consent_confirmed, allowed_start_time, allowed_end_time, allowed_days, timezone, starts_at, target_count, project:projects(name), agent:voice_agents(name)")
          .eq("organization_id", org.id).in("status", ["launching", "scheduled", "running", "paused"]).order("created_at", { ascending: false }),
        supabase.from("calls").select("id, phone, status, sarvam_status, duration_seconds, answers, updated_at, campaign:call_campaigns(name), contact:contacts(first_name, last_name)")
          .eq("organization_id", org.id).in("status", ["queued", "in_progress"]).gte("created_at", new Date(Date.now() - 30 * 60 * 1000).toISOString()).order("created_at", { ascending: false }),
        supabase.from("calls").select("id, phone, status, sarvam_status, duration_seconds, answers, updated_at, campaign:call_campaigns(name), contact:contacts(first_name, last_name)")
          .eq("organization_id", org.id).not("status", "in", "(queued,in_progress)").order("updated_at", { ascending: false }).limit(25),
      ]);
      if (campaigns.error) throw campaigns.error;
      const ids = (campaigns.data ?? []).map((campaign) => campaign.id);
      const { data: targets } = ids.length
        ? await supabase.from("campaign_targets").select("campaign_id, status").in("campaign_id", ids).limit(50000)
        : { data: [] as Array<{ campaign_id: string; status: string }> };
      const counts = new Map<string, Record<string, number>>();
      for (const target of targets ?? []) {
        const row = counts.get(target.campaign_id) ?? {};
        row[target.status] = (row[target.status] ?? 0) + 1;
        counts.set(target.campaign_id, row);
      }
      return {
        campaigns: (campaigns.data ?? []) as unknown as LiveCampaign[],
        counts,
        dialing: (dialing.data ?? []) as unknown as FeedCall[],
        feed: (feed.data ?? []) as unknown as FeedCall[],
      };
    },
  });

  const data = live.data;
  const today = (data?.feed ?? []).filter((call) => new Date(call.updated_at).toDateString() === new Date().toDateString());
  const name = (call: FeedCall) => (call.contact ? `${call.contact.first_name} ${call.contact.last_name ?? ""}`.trim() : call.phone ?? "Unknown");

  return (
    <div className="animate-rise space-y-5">
      <PageHeader title="Live Calls" description="Running campaigns, calls being dialed and results as they arrive. Updates every 5 seconds.">
        <span className="inline-flex items-center gap-2 rounded-full bg-success-soft px-3 py-1 text-xs font-semibold text-success"><span className="size-2 animate-pulse rounded-full bg-success" /> Live</span>
      </PageHeader>

      <KpiGrid loading={live.isLoading} items={[
        { label: "Active campaigns", value: data?.campaigns.filter((campaign) => campaign.status !== "paused").length ?? 0, hint: `${data?.campaigns.filter((campaign) => campaign.status === "paused").length ?? 0} paused` },
        { label: "Dialing now", value: data?.dialing.length ?? 0 },
        { label: "Results today", value: today.length },
        { label: "Connected today", value: today.filter((call) => call.status === "completed").length },
      ]} />

      <section className="space-y-3">
        <h2 className="flex items-center gap-2 text-sm font-semibold"><Radio className="size-4 text-primary" /> Campaigns in progress</h2>
        {live.isLoading ? <Skeleton className="h-28 rounded-2xl" /> : !data?.campaigns.length ? (
          <p className="rounded-2xl border border-dashed p-6 text-center text-sm text-muted-foreground">No campaigns running. Start one from a project's <b>Run campaign</b> button.</p>
        ) : data.campaigns.map((campaign) => {
          const row = data.counts.get(campaign.id) ?? {};
          const total = Object.values(row).reduce((sum, n) => sum + n, 0);
          const open = OPEN.reduce((sum, status) => sum + (row[status] ?? 0), 0);
          const waiting = ["running", "scheduled", "launching"].includes(campaign.status) && outsideCallingHours(campaign);
          const notStarted = campaign.starts_at && new Date(campaign.starts_at) > new Date();
          return (
            <div key={campaign.id} className="rounded-2xl border bg-card p-4 shadow-soft">
              <div className="flex flex-wrap items-center gap-2">
                <Link to="/call-campaigns/$campaignId" params={{ campaignId: campaign.id }} className="font-semibold hover:text-primary">{campaign.name}</Link>
                <StatusBadge value={campaign.status} />
                <span className="text-xs text-muted-foreground">{campaign.project?.name ?? "No project"} · {campaign.agent?.name ?? "—"} · {campaign.allowed_start_time}–{campaign.allowed_end_time}</span>
                <div className="ml-auto"><CampaignControls campaign={campaign} compact /></div>
              </div>
              {waiting && <p className="mt-2 flex items-center gap-1.5 text-xs text-warning"><Clock className="size-3.5" /> Outside calling hours — Sarvam is holding calls until {campaign.allowed_start_time}.</p>}
              {!waiting && notStarted && <p className="mt-2 flex items-center gap-1.5 text-xs text-muted-foreground"><Clock className="size-3.5" /> Starts at {new Date(campaign.starts_at!).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}.</p>}
              <div className="mt-3 flex items-center gap-3">
                <Progress value={pct(total - open, total)} className="h-2" />
                <span className="shrink-0 text-xs tabular-nums text-muted-foreground">{total - open}/{total} done</span>
              </div>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {Object.entries(row).sort((a, b) => b[1] - a[1]).map(([status, n]) => (
                  <span key={status} className="inline-flex items-center gap-1 text-xs"><StatusBadge value={status} /><span className="tabular-nums text-muted-foreground">{n}</span></span>
                ))}
              </div>
            </div>
          );
        })}
      </section>

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="rounded-2xl border bg-card p-4 shadow-soft">
          <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold"><PhoneCall className="size-4 text-primary" /> Dialing now</h2>
          {!data?.dialing.length ? <p className="py-6 text-center text-sm text-muted-foreground">No calls ringing. Campaign calls show up here as results once each attempt finishes.</p> : (
            <ul className="divide-y">
              {data.dialing.map((call) => (
                <li key={call.id} className="flex items-center gap-2 py-2 text-sm">
                  <span className="size-2 animate-pulse rounded-full bg-success" />
                  <span className="font-medium">{name(call)}</span>
                  <span className="text-xs text-muted-foreground">{call.phone}</span>
                  <span className="ml-auto text-xs text-muted-foreground">{call.campaign?.name ?? "Test call"} · {call.sarvam_status ?? call.status}</span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="rounded-2xl border bg-card p-4 shadow-soft">
          <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold"><PhoneIncoming className="size-4 text-primary" /> Latest results</h2>
          {!data?.feed.length ? <p className="py-6 text-center text-sm text-muted-foreground">No call results yet.</p> : (
            <ul className="divide-y">
              {data.feed.map((call) => (
                <li key={call.id}>
                  <button type="button" onClick={() => setOpenCall(call.id)} className="flex w-full flex-wrap items-center gap-2 py-2 text-left text-sm hover:bg-muted/50">
                    <StatusBadge value={call.sarvam_status === "busy" ? "busy" : call.status} />
                    <span className="font-medium">{name(call)}</span>
                    <span className="text-xs text-muted-foreground">{call.campaign?.name ?? "Test call"} · {duration(Number(call.duration_seconds ?? 0))}</span>
                    <span className="ml-auto text-xs text-muted-foreground">{new Date(call.updated_at).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}</span>
                    <div className="w-full"><AnswerChips answers={call.answers} max={3} /></div>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <CallDetailSheet callId={openCall} onClose={() => setOpenCall(null)} />
    </div>
  );
}
