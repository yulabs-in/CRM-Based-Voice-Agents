import { useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { FolderKanban, Loader2, Megaphone, PhoneCall, Plus, Upload, Users } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { PageHeader } from "@/components/app/PageHeader";
import { StatusBadge } from "@/components/app/StatusBadge";
import { ImportDialog } from "@/components/app/ImportDialog";
import { supabase } from "@/integrations/supabase/client";
import { canWrite, useOrg } from "@/lib/org";
import { shortDate } from "@/lib/format";
import { pageHead } from "@/lib/seo";
import { fetchAll } from "@/lib/fetch-all";
import { pctLabel } from "@/lib/call-insights";

export const Route = createFileRoute("/_authenticated/_app/projects/")({
  head: () => pageHead("Projects", "Contact lists you import and call as a group."),
  component: Page,
});

function Page() {
  const { org, role } = useOrg();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [importing, setImporting] = useState(false);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({ name: "", description: "" });

  const data = useQuery({
    queryKey: ["projects", org.id, "overview"],
    queryFn: async () => {
      const [projects, campaigns, calls] = await Promise.all([
        supabase.from("projects").select("*").eq("organization_id", org.id).order("created_at", { ascending: false }),
        supabase.from("call_campaigns").select("id, project_id, status").eq("organization_id", org.id).not("project_id", "is", null),
        fetchAll<{ campaign_id: string | null; status: string; sentiment: string | null }>((from, to) =>
          supabase.from("calls").select("campaign_id, status, sentiment").eq("organization_id", org.id).not("campaign_id", "is", null).range(from, to)),
      ]);
      if (projects.error) throw projects.error;
      const campaignProject = new Map((campaigns.data ?? []).map((campaign) => [campaign.id, campaign.project_id]));
      return (projects.data ?? []).map((project) => {
        const ownCampaigns = (campaigns.data ?? []).filter((campaign) => campaign.project_id === project.id);
        const ownCalls = calls.filter((call) => call.campaign_id && campaignProject.get(call.campaign_id) === project.id);
        return {
          ...project,
          campaigns: ownCampaigns.length,
          running: ownCampaigns.filter((campaign) => campaign.status === "running").length,
          calls: ownCalls.length,
          connectRate: pctLabel(ownCalls.filter((call) => call.status === "completed").length, ownCalls.length),
          positive: ownCalls.filter((call) => call.sentiment === "positive").length,
        };
      });
    },
  });

  const create = useMutation({
    mutationFn: async () => {
      const { data: project, error } = await supabase.from("projects").insert({ organization_id: org.id, name: form.name.trim(), description: form.description.trim() || null }).select("id").single();
      if (error || !project) throw new Error(error?.message ?? "Could not create the project");
      return project.id;
    },
    onSuccess: (projectId) => {
      toast.success("Project created");
      setCreating(false);
      setForm({ name: "", description: "" });
      void qc.invalidateQueries({ queryKey: ["projects"] });
      void navigate({ to: "/projects/$projectId", params: { projectId } });
    },
    onError: (error) => toast.error(error.message),
  });

  const projects = data.data ?? [];
  const active = projects.filter((project) => project.status === "active");
  const archived = projects.filter((project) => project.status !== "active");

  return (
    <div className="animate-rise space-y-5">
      <PageHeader title="Projects" description="Each project is a list of contacts — usually one uploaded file — that you can call together in a campaign.">
        {canWrite(role) && <Button variant="outline" onClick={() => setCreating(true)}><Plus /> Empty project</Button>}
        {canWrite(role) && <Button variant="hero" onClick={() => setImporting(true)}><Upload /> Import CSV / Excel</Button>}
      </PageHeader>

      {data.isLoading ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{Array.from({ length: 3 }, (_, index) => <Skeleton key={index} className="h-48 rounded-2xl" />)}</div>
      ) : !projects.length ? (
        <div className="dot-canvas rounded-2xl border border-dashed py-16 text-center">
          <span className="mx-auto grid size-12 place-items-center rounded-2xl bg-accent text-accent-foreground"><FolderKanban /></span>
          <p className="mt-4 font-semibold">No projects yet</p>
          <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">Upload a CSV or Excel file of customers. It becomes a project you can call with one campaign, and every answer is saved back to each contact.</p>
          {canWrite(role) && <Button variant="hero" className="mt-5" onClick={() => setImporting(true)}><Upload /> Import your first file</Button>}
        </div>
      ) : (
        <>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {active.map((project) => <ProjectCard key={project.id} project={project} />)}
          </div>
          {archived.length > 0 && (
            <details className="rounded-2xl border p-4">
              <summary className="cursor-pointer text-sm font-semibold">Archived projects ({archived.length})</summary>
              <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-3">{archived.map((project) => <ProjectCard key={project.id} project={project} />)}</div>
            </details>
          )}
        </>
      )}

      <ImportDialog open={importing} onOpenChange={setImporting} onDone={(projectId) => void navigate({ to: "/projects/$projectId", params: { projectId } })} />

      <Dialog open={creating} onOpenChange={setCreating}>
        <DialogContent className="rounded-2xl sm:max-w-md">
          <DialogHeader><DialogTitle>New project</DialogTitle></DialogHeader>
          <form className="space-y-4" onSubmit={(event) => { event.preventDefault(); create.mutate(); }}>
            <div className="space-y-1.5"><Label htmlFor="project-name">Name *</Label><Input id="project-name" required maxLength={80} value={form.name} onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))} className="rounded-xl" /></div>
            <div className="space-y-1.5"><Label htmlFor="project-description">Description</Label><Textarea id="project-description" maxLength={500} value={form.description} onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))} className="rounded-xl" /></div>
            <DialogFooter>
              <Button type="button" variant="ghost" onClick={() => setCreating(false)}>Cancel</Button>
              <Button type="submit" variant="hero" disabled={create.isPending || !form.name.trim()}>{create.isPending && <Loader2 className="animate-spin" />} Create</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

type ProjectSummary = {
  id: string; name: string; description: string | null; status: string; source: string; contact_count: number; created_at: string;
  campaigns: number; running: number; calls: number; connectRate: string; positive: number;
};

function ProjectCard({ project }: { project: ProjectSummary }) {
  return (
    <Link to="/projects/$projectId" params={{ projectId: project.id }}
      className="group rounded-2xl border bg-card p-5 shadow-soft transition-colors hover:border-primary/50">
      <div className="flex items-start gap-3">
        <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-accent text-accent-foreground"><FolderKanban className="size-5" /></span>
        <div className="min-w-0 flex-1">
          <p className="truncate font-semibold group-hover:text-primary">{project.name}</p>
          <p className="text-xs text-muted-foreground">{project.source === "manual" ? "Manual" : project.source.toUpperCase()} · created {shortDate(project.created_at)}</p>
        </div>
        {project.running > 0 ? <StatusBadge value="running" /> : project.status !== "active" ? <StatusBadge value={project.status} /> : null}
      </div>
      {project.description && <p className="mt-3 line-clamp-2 text-sm text-muted-foreground">{project.description}</p>}
      <dl className="mt-4 grid grid-cols-3 gap-2 text-center">
        <Metric icon={<Users className="size-3.5" />} label="Contacts" value={project.contact_count.toLocaleString()} />
        <Metric icon={<Megaphone className="size-3.5" />} label="Campaigns" value={String(project.campaigns)} />
        <Metric icon={<PhoneCall className="size-3.5" />} label="Connected" value={project.connectRate} />
      </dl>
    </Link>
  );
}

function Metric({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="rounded-xl bg-muted/50 px-2 py-2">
      <dt className="flex items-center justify-center gap-1 text-[11px] text-muted-foreground">{icon}{label}</dt>
      <dd className="mt-0.5 text-lg font-bold tabular-nums">{value}</dd>
    </div>
  );
}
