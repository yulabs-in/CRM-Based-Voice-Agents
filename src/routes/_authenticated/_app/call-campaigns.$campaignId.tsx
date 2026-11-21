import { useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ArrowLeft, Clock, Download, PhoneCall, RefreshCw, Search } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { PageHeader } from "@/components/app/PageHeader";
import { StatusBadge } from "@/components/app/StatusBadge";
import { AnswerChips } from "@/components/app/AnswerChips";
import { CallDetailSheet } from "@/components/app/CallDetailSheet";
import { CampaignControls, outsideCallingHours } from "@/components/app/CampaignControls";
import { BarBox, ChartCard, Funnel, KpiGrid, PieBox } from "@/components/app/charts";
import { supabase } from "@/lib/supabase";
import { useOrg } from "@/lib/org";
import { pageHead } from "@/lib/seo";
import { downloadCsv } from "@/lib/csv";
import { fetchAll } from "@/lib/fetch-all";
import { answerBreakdown, bestHours, callFunnel, callKpis, countBy, duration, pct, type CallRow } from "@/lib/call-insights";
import { asAnswers, humanize } from "@/lib/sarvam-call";
import { launchCampaign, setCampaignStatus, syncCampaign } from "@/lib/campaigns.functions";

export const Route = createFileRoute("/_authenticated/_app/call-campaigns/$campaignId")({
  head: () => pageHead("Campaign", "Progress, answers and recordings for a calling campaign."),
  component: Page,
});

const CAMPAIGN_ROLES = ["owner", "admin", "sales_manager", "voice_manager"];
const OPEN = ["pending", "queued", "calling", "retrying"];
const PAGE = 50;
type Target = {
  id: string; status: string; attempts: number; answers: unknown; last_outcome: string | null; last_call_id: string | null; phone: string; updated_at: string;
  contact: { first_name: string; last_name: string | null; email: string | null } | null;
};

function Page() {
  const { campaignId } = Route.useParams();
  const { org, role } = useOrg();
  const qc = useQueryClient();
  const launch = useServerFn(launchCampaign);
  const control = useServerFn(setCampaignStatus);
  const sync = useServerFn(syncCampaign);
  const [filter, setFilter] = useState("all");
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(0);
  const [openCall, setOpenCall] = useState<string | null>(null);
  const canRun = CAMPAIGN_ROLES.includes(role);

  const campaign = useQuery({
    queryKey: ["campaigns", org.id, campaignId],
    refetchInterval: (q) => (q.state.data && ["launching", "running", "scheduled"].includes(q.state.data.status) ? 15000 : false),
    queryFn: async () => {
      const { data, error } = await supabase.from("call_campaigns").select("*, project:projects(id, name, contact_count), agent:voice_agents(name)").eq("id", campaignId).maybeSingle();
      if (error) throw error;
      return data;
    },
  });
  const live = campaign.data && ["launching", "running", "scheduled"].includes(campaign.data.status);

  const results = useQuery({
    queryKey: ["campaigns", org.id, campaignId, "results"],
    enabled: !!campaign.data,
    refetchInterval: live ? 15000 : false,
    queryFn: async () => {
      const [targets, calls] = await Promise.all([
        fetchAll<Target>((from, to) => supabase.from("campaign_targets").select("id, status, attempts, answers, last_outcome, last_call_id, phone, updated_at, contact:contacts(first_name, last_name, email)").eq("campaign_id", campaignId).order("updated_at", { ascending: false }).range(from, to), 100000),
        fetchAll<CallRow>((from, to) => supabase.from("calls").select("id, status, duration_seconds, sentiment, outcome, campaign_id, agent_id, contact_id, started_at, created_at, answers, recording_path").eq("campaign_id", campaignId).range(from, to), 200000),
      ]);
      return { targets, calls };
    },
  });

  const refresh = () => { void qc.invalidateQueries({ queryKey: ["campaigns"] }); };
  const act = useMutation({
    mutationFn: async (action: "launch" | "pause" | "resume" | "cancel" | "sync") => {
      if (action === "launch") return launch({ data: { campaignId } }).then((result) => `Launched — ${result.contacts.toLocaleString()} contacts sent to Sarvam`);
      if (action === "sync") return sync({ data: { campaignId } }).then((result) => `Sarvam status: ${result.status}`);
      return control({ data: { campaignId, action } }).then((result) => `Campaign ${result.status}`);
    },
    onSuccess: (text) => { toast.success(text); refresh(); },
    onError: (error) => { toast.error(error.message); refresh(); },
  });

  const targets = useMemo(() => results.data?.targets ?? [], [results.data]);
  const calls = results.data?.calls ?? [];
  const filtered = useMemo(() => {
    const text = query.trim().toLowerCase();
    return targets.filter((target) => (filter === "all" || target.status === filter || (filter === "open" && OPEN.includes(target.status)))
      && (!text || [target.phone, target.contact?.first_name, target.contact?.last_name, JSON.stringify(target.answers)].some((value) => String(value ?? "").toLowerCase().includes(text))));
  }, [targets, filter, query]);
  const pages = Math.max(1, Math.ceil(filtered.length / PAGE));

  if (campaign.isLoading) return <Skeleton className="h-96 rounded-2xl" />;
  if (!campaign.data) return <div className="py-16 text-center"><p className="font-semibold">Campaign not found</p><Button asChild variant="outline" className="mt-4"><Link to="/call-campaigns"><ArrowLeft /> Back</Link></Button></div>;

  const c = campaign.data;
  const done = targets.filter((target) => !OPEN.includes(target.status)).length;
  const kpi = callKpis(calls);
  const answers = answerBreakdown(calls);
  const statusCounts = countBy(targets, (target) => humanize(target.status));

  function exportResults() {
    const keys = [...new Set(targets.flatMap((target) => Object.keys(asAnswers(target.answers))))];
    downloadCsv(`${c.name}-results.csv`, targets.map((target) => ({
      name: `${target.contact?.first_name ?? ""} ${target.contact?.last_name ?? ""}`.trim(), phone: target.phone, email: target.contact?.email ?? "",
      status: target.status, attempts: target.attempts, outcome: target.last_outcome ?? "",
      ...Object.fromEntries(keys.map((key) => [key, asAnswers(target.answers)[key] ?? ""])),
    })));
  }

  return (
    <div className="animate-rise space-y-5">
      <Link to="/call-campaigns" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="size-4" /> Campaigns</Link>
      <PageHeader title={c.name} description={`${c.project ? `Project: ${c.project.name}` : "No project"} · Agent: ${c.agent?.name ?? "—"} · ${c.allowed_start_time}–${c.allowed_end_time} ${c.timezone}`}>
        <StatusBadge value={c.status} />
        <Button variant="outline" onClick={exportResults} disabled={!targets.length}><Download /> Export results</Button>
        <CampaignControls campaign={c} />
        {c.sarvam_campaign_id && <Button variant="ghost" size="icon" aria-label="Sync status from Sarvam" disabled={act.isPending} onClick={() => act.mutate("sync")}><RefreshCw /></Button>}
      </PageHeader>

      {c.last_error && <p className="rounded-xl bg-danger-soft p-3 text-sm text-destructive">{c.last_error}</p>}
      {["running", "scheduled", "launching"].includes(c.status) && outsideCallingHours(c) && (
        <p className="flex items-start gap-2 rounded-xl bg-warning-soft p-3 text-sm text-warning">
          <Clock className="mt-0.5 size-4 shrink-0" />
          <span>Outside calling hours ({c.allowed_start_time}–{c.allowed_end_time} {c.timezone}, {c.allowed_days.map((day: string) => day.slice(0, 3)).join(", ")}). Sarvam is holding the calls until the window opens — use <b>Calling hours</b> above to change it.</span>
        </p>
      )}
      {c.status === "draft" && !c.consent_confirmed && <p className="rounded-xl bg-warning-soft p-3 text-sm text-warning">This draft was saved without the consent confirmation. Create a new campaign and tick the confirmation to launch.</p>}

      {targets.length > 0 && (
        <div className="rounded-2xl border bg-card p-4 shadow-soft">
          <div className="mb-2 flex items-baseline justify-between text-sm"><span className="font-semibold">Progress</span><span className="tabular-nums text-muted-foreground">{done.toLocaleString()} of {targets.length.toLocaleString()} contacts finished ({pct(done, targets.length)}%)</span></div>
          <Progress value={pct(done, targets.length)} />
        </div>
      )}

      <KpiGrid columns={6} loading={results.isLoading} items={[
        { label: "Contacts", value: targets.length.toLocaleString() || c.target_count },
        { label: "Still to call", value: targets.filter((target) => OPEN.includes(target.status)).length.toLocaleString(), hint: `${targets.filter((target) => target.status === "retrying").length} waiting to retry` },
        { label: "Reached", value: targets.filter((target) => target.status === "completed").length.toLocaleString() },
        { label: "Connect rate", value: kpi.connectRate, hint: `${kpi.total.toLocaleString()} attempts` },
        { label: "Avg. talk time", value: duration(kpi.avgDuration) },
        { label: "Positive outcomes", value: kpi.positive.toLocaleString(), hint: `${kpi.recordings} recordings` },
      ]} />

      <div className="grid gap-4 lg:grid-cols-3">
        <ChartCard title="Contact status"><PieBox data={statusCounts} /></ChartCard>
        <ChartCard title="Call funnel"><Funnel steps={callFunnel(calls)} /></ChartCard>
        <ChartCard title="Connect % by hour"><BarBox data={bestHours(calls).map((slot) => ({ name: slot.name, value: slot.rate }))} format={(value) => `${value}%`} /></ChartCard>
      </div>
      {answers.length > 0 && (
        <div className="grid gap-4 lg:grid-cols-3">
          {answers.map((entry) => (
            <ChartCard key={entry.key} title={`What they said · ${entry.label}`}>
              {entry.values.length <= 5 ? <PieBox data={entry.values} /> : <BarBox data={entry.values} horizontal />}
            </ChartCard>
          ))}
        </div>
      )}

      <div className="rounded-2xl border bg-card shadow-soft">
        <div className="flex flex-wrap items-center gap-3 border-b p-3">
          <div className="relative w-full max-w-xs">
            <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input value={query} onChange={(event) => { setQuery(event.target.value); setPage(0); }} placeholder="Search name, phone, answer…" className="h-9 rounded-xl pl-9" />
          </div>
          <Select value={filter} onValueChange={(value) => { setFilter(value); setPage(0); }}>
            <SelectTrigger className="h-9 w-44 rounded-xl" aria-label="Filter by status"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All contacts</SelectItem>
              <SelectItem value="open">Not finished</SelectItem>
              {["completed", "retrying", "no_answer", "busy", "failed", "queued", "excluded"].map((status) => <SelectItem key={status} value={status}>{humanize(status)}</SelectItem>)}
            </SelectContent>
          </Select>
          <span className="ml-auto text-xs text-muted-foreground">{filtered.length.toLocaleString()} contacts</span>
        </div>
        {results.isLoading ? <div className="space-y-2 p-4">{Array.from({ length: 5 }, (_, index) => <Skeleton key={index} className="h-10" />)}</div> : !filtered.length ? (
          <p className="py-14 text-center text-sm text-muted-foreground">{targets.length ? "No contacts match." : c.status === "draft" ? "Launch the campaign to build the call list." : "No contacts yet."}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="border-b text-left text-xs uppercase tracking-wide text-muted-foreground">
                <th className="px-4 py-2.5">Contact</th><th className="px-4 py-2.5">Phone</th><th className="px-4 py-2.5">Status</th><th className="px-4 py-2.5">Attempts</th><th className="px-4 py-2.5">Answers</th><th className="w-10" />
              </tr></thead>
              <tbody>
                {filtered.slice(page * PAGE, page * PAGE + PAGE).map((target) => (
                  <tr key={target.id} className={"border-b last:border-0 hover:bg-muted/60" + (target.last_call_id ? " cursor-pointer" : "")} onClick={() => target.last_call_id && setOpenCall(target.last_call_id)}>
                    <td className="px-4 py-2.5 font-semibold">{`${target.contact?.first_name ?? ""} ${target.contact?.last_name ?? ""}`.trim() || "—"}</td>
                    <td className="px-4 py-2.5 tabular-nums">{target.phone}</td>
                    <td className="px-4 py-2.5"><StatusBadge value={target.status} /></td>
                    <td className="px-4 py-2.5 tabular-nums">{target.attempts}</td>
                    <td className="max-w-md px-4 py-2.5"><AnswerChips answers={target.answers} /></td>
                    <td className="pr-3">{target.last_call_id && <Button size="icon" variant="ghost" aria-label="Open call"><PhoneCall /></Button>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {pages > 1 && (
          <div className="flex items-center justify-end gap-2 border-t p-3 text-sm">
            <span className="text-muted-foreground">Page {page + 1} of {pages}</span>
            <Button size="sm" variant="outline" disabled={page === 0} onClick={() => setPage((current) => current - 1)}>Previous</Button>
            <Button size="sm" variant="outline" disabled={page + 1 >= pages} onClick={() => setPage((current) => current + 1)}>Next</Button>
          </div>
        )}
      </div>

      <CallDetailSheet callId={openCall} onClose={() => setOpenCall(null)} />
    </div>
  );
}
