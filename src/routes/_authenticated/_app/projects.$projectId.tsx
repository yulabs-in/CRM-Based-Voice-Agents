import { useMemo, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Archive, Download, FileSpreadsheet, Megaphone, MoreHorizontal, Pencil, PhoneCall, Search, Trash2, Upload } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { PageHeader } from "@/components/app/PageHeader";
import { StatusBadge } from "@/components/app/StatusBadge";
import { ImportDialog } from "@/components/app/ImportDialog";
import { AnswerChips } from "@/components/app/AnswerChips";
import { CallDetailSheet } from "@/components/app/CallDetailSheet";
import { CampaignControls, outsideCallingHours } from "@/components/app/CampaignControls";
import { BarBox, ChartCard, Funnel, KpiGrid, PieBox, TrendBox } from "@/components/app/charts";
import { supabase } from "@/integrations/supabase/client";
import { canDelete, canWrite, isAdmin, useOrg } from "@/lib/org";
import { shortDate } from "@/lib/format";
import { pageHead } from "@/lib/seo";
import { downloadCsv } from "@/lib/csv";
import { fetchAll } from "@/lib/fetch-all";
import { answerBreakdown, bestHours, callFunnel, callKpis, callsOverTime, campaignComparison, countBy, duration, type CallRow } from "@/lib/call-insights";
import { asAnswers, humanize } from "@/lib/sarvam-call";

export const Route = createFileRoute("/_authenticated/_app/projects/$projectId")({
  head: () => pageHead("Project", "Contacts, campaigns and results for one project."),
  component: Page,
});

const PAGE = 50;
type Contact = {
  id: string; first_name: string; last_name: string | null; phone: string | null; email: string | null; city: string | null;
  job_title: string | null; tags: string[]; custom_fields: unknown; created_at: string;
};
type Target = { id: string; campaign_id: string; contact_id: string | null; status: string; attempts: number; answers: unknown; last_call_id: string | null; last_outcome: string | null; updated_at: string };

function Page() {
  const { projectId } = Route.useParams();
  const { org, role } = useOrg();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [importing, setImporting] = useState(false);
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(0);
  const [openCall, setOpenCall] = useState<string | null>(null);

  const project = useQuery({
    queryKey: ["projects", org.id, projectId],
    queryFn: async () => {
      const { data, error } = await supabase.from("projects").select("*").eq("id", projectId).eq("organization_id", org.id).maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const contacts = useQuery({
    queryKey: ["contacts", org.id, "project", projectId],
    queryFn: () => fetchAll<Contact>((from, to) => supabase.from("contacts")
      .select("id, first_name, last_name, phone, email, city, job_title, tags, custom_fields, created_at")
      .eq("organization_id", org.id).eq("project_id", projectId).order("created_at").range(from, to), 50000),
  });

  const results = useQuery({
    queryKey: ["campaigns", org.id, "project", projectId],
    queryFn: async () => {
      const { data: campaigns, error } = await supabase.from("call_campaigns")
        .select("id, name, status, project_id, target_count, created_at, launched_at, agent_id, consent_confirmed, allowed_start_time, allowed_end_time, allowed_days, timezone").eq("organization_id", org.id).eq("project_id", projectId).order("created_at", { ascending: false });
      if (error) throw error;
      const ids = (campaigns ?? []).map((campaign) => campaign.id);
      if (!ids.length) return { campaigns: [], targets: [] as Target[], calls: [] as CallRow[] };
      const [targets, calls] = await Promise.all([
        fetchAll<Target>((from, to) => supabase.from("campaign_targets").select("id, campaign_id, contact_id, status, attempts, answers, last_call_id, last_outcome, updated_at").in("campaign_id", ids).range(from, to), 100000),
        fetchAll<CallRow>((from, to) => supabase.from("calls").select("id, status, duration_seconds, sentiment, outcome, campaign_id, agent_id, contact_id, started_at, created_at, answers, recording_path").in("campaign_id", ids).range(from, to), 100000),
      ]);
      return { campaigns: campaigns ?? [], targets, calls };
    },
  });

  const imports = useQuery({
    queryKey: ["imports", org.id, projectId],
    queryFn: async () => {
      const { data, error } = await supabase.from("imports").select("*").eq("organization_id", org.id).eq("project_id", projectId).order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  // Latest campaign result per contact (what they answered, how the call went).
  const latestByContact = useMemo(() => {
    const map = new Map<string, Target>();
    for (const target of results.data?.targets ?? []) {
      if (!target.contact_id) continue;
      const current = map.get(target.contact_id);
      if (!current || target.updated_at > current.updated_at) map.set(target.contact_id, target);
    }
    return map;
  }, [results.data]);

  const customKeys = useMemo(() => {
    const counts = new Map<string, number>();
    for (const contact of contacts.data ?? []) for (const key of Object.keys(asAnswers(contact.custom_fields))) counts.set(key, (counts.get(key) ?? 0) + 1);
    return [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([key]) => key);
  }, [contacts.data]);

  const filtered = useMemo(() => {
    const text = query.trim().toLowerCase();
    const rows = contacts.data ?? [];
    if (!text) return rows;
    return rows.filter((contact) => [contact.first_name, contact.last_name, contact.phone, contact.email, contact.city, JSON.stringify(contact.custom_fields)]
      .some((value) => String(value ?? "").toLowerCase().includes(text)));
  }, [contacts.data, query]);
  const pageRows = filtered.slice(page * PAGE, page * PAGE + PAGE);
  const pages = Math.max(1, Math.ceil(filtered.length / PAGE));

  const update = useMutation({
    mutationFn: async (patch: { name?: string; status?: string }) => {
      const { error } = await supabase.from("projects").update({ ...patch, updated_at: new Date().toISOString() }).eq("id", projectId);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Project updated"); void qc.invalidateQueries({ queryKey: ["projects"] }); },
    onError: (error) => toast.error(error.message),
  });
  const remove = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("projects").delete().eq("id", projectId);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Project deleted — its contacts are still in Contacts"); void qc.invalidateQueries({ queryKey: ["projects"] }); void navigate({ to: "/projects" }); },
    onError: (error) => toast.error(error.message),
  });

  function exportContacts() {
    downloadCsv(`${project.data?.name ?? "project"}-contacts.csv`, filtered.map((contact) => {
      const latest = latestByContact.get(contact.id);
      return {
        first_name: contact.first_name, last_name: contact.last_name ?? "", phone: contact.phone ?? "", email: contact.email ?? "", city: contact.city ?? "",
        ...Object.fromEntries(Object.entries(asAnswers(contact.custom_fields)).map(([key, value]) => [key, value])),
        last_call_status: latest?.status ?? "", attempts: latest?.attempts ?? "",
        ...Object.fromEntries(Object.entries(asAnswers(latest?.answers)).map(([key, value]) => [`answer_${key}`, value])),
      };
    }));
  }

  if (project.isLoading) return <Skeleton className="h-96 rounded-2xl" />;
  if (!project.data) {
    return (
      <div className="space-y-4 py-16 text-center">
        <p className="font-semibold">Project not found</p>
        <Button asChild variant="outline"><Link to="/projects"><ArrowLeft /> Back to projects</Link></Button>
      </div>
    );
  }

  const calls = results.data?.calls ?? [];
  const kpi = callKpis(calls);
  const withPhone = (contacts.data ?? []).filter((contact) => contact.phone).length;
  const reached = new Set(calls.filter((call) => call.status === "completed" && call.contact_id).map((call) => call.contact_id)).size;

  return (
    <div className="animate-rise space-y-5">
      <Link to="/projects" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="size-4" /> Projects</Link>
      <PageHeader title={project.data.name} description={project.data.description ?? `${project.data.source === "manual" ? "Manual" : project.data.source.toUpperCase()} project · created ${shortDate(project.data.created_at)}`}>
        <Button variant="outline" onClick={exportContacts} disabled={!filtered.length}><Download /> Export</Button>
        {canWrite(role) && <Button variant="outline" onClick={() => setImporting(true)}><Upload /> Import more</Button>}
        {canWrite(role) && (
          <Button variant="hero" disabled={!withPhone} onClick={() => void navigate({ to: "/call-campaigns", search: { new: true, projectId } })}>
            <Megaphone /> Run campaign
          </Button>
        )}
        {isAdmin(role) && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild><Button variant="ghost" size="icon" aria-label="Project actions"><MoreHorizontal /></Button></DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => { const name = prompt("Project name", project.data!.name)?.trim(); if (name) update.mutate({ name }); }}><Pencil /> Rename</DropdownMenuItem>
              <DropdownMenuItem onClick={() => update.mutate({ status: project.data!.status === "active" ? "archived" : "active" })}><Archive /> {project.data.status === "active" ? "Archive" : "Restore"}</DropdownMenuItem>
              {canDelete(role) && <DropdownMenuItem className="text-destructive" onClick={() => confirm("Delete this project? Its contacts stay in Contacts; its campaigns are unlinked.") && remove.mutate()}><Trash2 /> Delete project</DropdownMenuItem>}
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </PageHeader>

      <KpiGrid columns={6} loading={contacts.isLoading || results.isLoading} items={[
        { label: "Contacts", value: (contacts.data?.length ?? 0).toLocaleString() },
        { label: "Callable (valid phone)", value: withPhone.toLocaleString() },
        { label: "Campaigns", value: results.data?.campaigns.length ?? 0 },
        { label: "Calls placed", value: kpi.total.toLocaleString(), hint: `${kpi.connectRate} connected` },
        { label: "Contacts reached", value: reached.toLocaleString(), hint: `${withPhone ? Math.round((reached / withPhone) * 100) : 0}% of callable` },
        { label: "Positive outcomes", value: kpi.positive.toLocaleString(), hint: `${kpi.answered} gave answers` },
      ]} />

      <Tabs defaultValue="contacts">
        <TabsList>
          <TabsTrigger value="contacts">Contacts</TabsTrigger>
          <TabsTrigger value="campaigns">Campaigns</TabsTrigger>
          <TabsTrigger value="insights">Insights</TabsTrigger>
          <TabsTrigger value="imports">Imports</TabsTrigger>
        </TabsList>

        <TabsContent value="contacts" className="mt-4">
          <div className="rounded-2xl border bg-card shadow-soft">
            <div className="flex items-center gap-3 border-b p-3">
              <div className="relative w-full max-w-xs">
                <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input value={query} onChange={(event) => { setQuery(event.target.value); setPage(0); }} placeholder="Search name, phone, any field…" className="h-9 rounded-xl pl-9" />
              </div>
              <span className="ml-auto text-xs text-muted-foreground">{filtered.length.toLocaleString()} contacts</span>
            </div>
            {contacts.isLoading ? <div className="space-y-2 p-4">{Array.from({ length: 6 }, (_, index) => <Skeleton key={index} className="h-10" />)}</div> : !filtered.length ? (
              <div className="py-14 text-center text-sm text-muted-foreground">{query ? "No matches." : "No contacts yet — import a file into this project."}</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead><tr className="border-b text-left text-xs uppercase tracking-wide text-muted-foreground">
                    <th className="px-4 py-2.5">Name</th><th className="px-4 py-2.5">Phone</th><th className="px-4 py-2.5">City</th>
                    {customKeys.map((key) => <th key={key} className="px-4 py-2.5">{humanize(key)}</th>)}
                    <th className="px-4 py-2.5">Last call</th><th className="px-4 py-2.5">Answers</th><th className="w-10" />
                  </tr></thead>
                  <tbody>
                    {pageRows.map((contact) => {
                      const latest = latestByContact.get(contact.id);
                      const custom = asAnswers(contact.custom_fields);
                      return (
                        <tr key={contact.id} className="border-b last:border-0 hover:bg-muted/60">
                          <td className="px-4 py-2.5"><p className="font-semibold">{contact.first_name} {contact.last_name ?? ""}</p>{contact.email && <p className="text-xs text-muted-foreground">{contact.email}</p>}</td>
                          <td className="px-4 py-2.5 tabular-nums">{contact.phone ?? <span className="text-xs text-destructive">{custom.raw_phone ? `invalid: ${custom.raw_phone}` : "—"}</span>}</td>
                          <td className="px-4 py-2.5">{contact.city ?? "—"}</td>
                          {customKeys.map((key) => <td key={key} className="max-w-40 truncate px-4 py-2.5">{custom[key] ?? "—"}</td>)}
                          <td className="px-4 py-2.5">{latest ? <div className="space-y-0.5"><StatusBadge value={latest.status} /><p className="text-[11px] text-muted-foreground">{latest.attempts} attempt{latest.attempts === 1 ? "" : "s"}</p></div> : <span className="text-muted-foreground">Not called</span>}</td>
                          <td className="max-w-72 px-4 py-2.5"><AnswerChips answers={latest?.answers} max={3} /></td>
                          <td className="pr-3">{latest?.last_call_id && <Button size="icon" variant="ghost" aria-label="Open last call" onClick={() => setOpenCall(latest.last_call_id)}><PhoneCall /></Button>}</td>
                        </tr>
                      );
                    })}
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
        </TabsContent>

        <TabsContent value="campaigns" className="mt-4">
          {!results.data?.campaigns.length ? (
            <div className="dot-canvas rounded-2xl border border-dashed py-14 text-center">
              <p className="font-semibold">No campaigns for this project yet</p>
              <p className="mt-1 text-sm text-muted-foreground">Run a campaign to have a Sarvam voice agent call every contact here.</p>
              {canWrite(role) && <Button variant="hero" className="mt-4" disabled={!withPhone} onClick={() => void navigate({ to: "/call-campaigns", search: { new: true, projectId } })}><Megaphone /> Run campaign</Button>}
            </div>
          ) : (
            <div className="overflow-x-auto rounded-2xl border bg-card shadow-soft">
              <table className="w-full text-sm">
                <thead><tr className="border-b text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <th className="px-4 py-2.5">Campaign</th><th className="px-4 py-2.5">Status</th><th className="px-4 py-2.5">Progress</th><th className="px-4 py-2.5">Calls</th><th className="px-4 py-2.5">Connected</th><th className="px-4 py-2.5">Positive</th><th className="px-4 py-2.5">Actions</th>
                </tr></thead>
                <tbody>
                  {campaignComparison(results.data.campaigns, results.data.targets, calls).map((row) => (
                    <tr key={row.id} className="border-b last:border-0 hover:bg-muted/60">
                      <td className="px-4 py-2.5"><Link to="/call-campaigns/$campaignId" params={{ campaignId: row.id }} className="font-semibold hover:text-primary">{row.name}</Link></td>
                      <td className="px-4 py-2.5"><StatusBadge value={row.status} />{(() => { const full = results.data!.campaigns.find((item) => item.id === row.id); return full && ["running", "scheduled", "launching"].includes(row.status) && outsideCallingHours(full) ? <p className="mt-1 text-[11px] text-warning">Outside calling hours</p> : null; })()}</td>
                      <td className="px-4 py-2.5"><div className="flex items-center gap-2"><div className="h-2 w-24 overflow-hidden rounded-full bg-muted"><div className="h-full bg-primary" style={{ width: `${row.progress}%` }} /></div><span className="text-xs tabular-nums">{row.progress}%</span></div></td>
                      <td className="px-4 py-2.5 tabular-nums">{row.calls}</td>
                      <td className="px-4 py-2.5 tabular-nums">{row.connected} <span className="text-xs text-muted-foreground">({row.rate}%)</span></td>
                      <td className="px-4 py-2.5 tabular-nums">{row.positive}</td>
                      <td className="px-4 py-2.5">{(() => { const full = results.data!.campaigns.find((item) => item.id === row.id); return full ? <CampaignControls campaign={full} compact /> : null; })()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </TabsContent>

        <TabsContent value="insights" className="mt-4 space-y-4">
          <ProjectInsights calls={calls} contacts={contacts.data ?? []} />
        </TabsContent>

        <TabsContent value="imports" className="mt-4">
          {!imports.data?.length ? <p className="py-10 text-center text-sm text-muted-foreground">No file imports for this project.</p> : (
            <div className="space-y-3">
              {imports.data.map((item) => {
                const errors = Array.isArray(item.errors) ? (item.errors as Array<{ row: number; reason: string }>) : [];
                return (
                  <div key={item.id} className="rounded-2xl border bg-card p-4 shadow-soft">
                    <div className="flex flex-wrap items-center gap-3">
                      <FileSpreadsheet className="size-5 text-muted-foreground" />
                      <p className="font-semibold">{item.file_name}</p>
                      <StatusBadge value={item.status} />
                      <span className="text-xs text-muted-foreground">{shortDate(item.created_at)}</span>
                      <span className="ml-auto text-sm tabular-nums">{item.inserted.toLocaleString()} imported · {item.skipped.toLocaleString()} skipped of {item.total_rows.toLocaleString()}</span>
                      {item.file_path && <DownloadOriginal path={item.file_path} />}
                    </div>
                    {errors.length > 0 && (
                      <details className="mt-2 text-sm"><summary className="cursor-pointer text-muted-foreground">Skipped rows ({errors.length})</summary>
                        <ul className="mt-1 max-h-40 overflow-y-auto text-muted-foreground">{errors.map((error) => <li key={`${error.row}-${error.reason}`}>Row {error.row}: {error.reason}</li>)}</ul>
                      </details>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </TabsContent>
      </Tabs>

      <ImportDialog open={importing} onOpenChange={setImporting} projectId={projectId} />
      <CallDetailSheet callId={openCall} onClose={() => setOpenCall(null)} />
    </div>
  );
}

function DownloadOriginal({ path }: { path: string }) {
  return (
    <Button size="sm" variant="ghost" onClick={async () => {
      const { data, error } = await supabase.storage.from("imports").createSignedUrl(path, 60);
      if (error || !data) { toast.error("Could not open the original file"); return; }
      window.open(data.signedUrl, "_blank", "noopener");
    }}><Download /> Original</Button>
  );
}

function ProjectInsights({ calls, contacts }: { calls: CallRow[]; contacts: Contact[] }) {
  const answers = answerBreakdown(calls);
  const kpi = callKpis(calls);
  const cities = countBy(contacts, (contact) => contact.city).slice(0, 10);
  return (
    <>
      <KpiGrid items={[
        { label: "Connect rate", value: kpi.connectRate, hint: `${kpi.connected} of ${kpi.total} calls` },
        { label: "Avg. talk time", value: duration(kpi.avgDuration) },
        { label: "Total talk time", value: `${kpi.talkMinutes.toLocaleString()} min` },
        { label: "Recordings saved", value: kpi.recordings },
      ]} />
      <div className="grid gap-4 lg:grid-cols-2">
        <ChartCard title="Call funnel"><Funnel steps={callFunnel(calls)} /></ChartCard>
        <ChartCard title="Calls over the last 30 days"><TrendBox data={callsOverTime(calls)} xKey="day" series={[{ key: "calls", label: "Calls" }, { key: "connected", label: "Connected" }]} height={220} /></ChartCard>
        <ChartCard title="Best time to call (connect % by hour)"><BarBox data={bestHours(calls).map((slot) => ({ name: slot.name, value: slot.rate }))} format={(value) => `${value}%`} /></ChartCard>
        <ChartCard title="Contacts by city"><BarBox data={cities} horizontal /></ChartCard>
      </div>
      {answers.length ? (
        <div className="grid gap-4 lg:grid-cols-2">
          {answers.map((entry) => (
            <ChartCard key={entry.key} title={`Answers · ${entry.label}`}>
              {entry.values.length <= 5 ? <PieBox data={entry.values} /> : <BarBox data={entry.values} horizontal />}
            </ChartCard>
          ))}
        </div>
      ) : (
        <p className="rounded-2xl border border-dashed p-6 text-center text-sm text-muted-foreground">Answer charts appear once calls finish. Configure output variables on your Sarvam agent (e.g. <code>interested</code>, <code>disposition</code>, <code>callback_time</code>) to capture what customers say.</p>
      )}
    </>
  );
}
