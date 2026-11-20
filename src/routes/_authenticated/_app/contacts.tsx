import { useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Upload, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { EntityPage } from "@/components/app/EntityPage";
import { StatusBadge } from "@/components/app/StatusBadge";
import { ImportDialog } from "@/components/app/ImportDialog";
import { supabase } from "@/integrations/supabase/client";
import { canWrite, useOrg } from "@/lib/org";
import { shortDate } from "@/lib/format";
import { pageHead } from "@/lib/seo";

export const Route = createFileRoute("/_authenticated/_app/contacts")({
  validateSearch: (s: Record<string, unknown>): { new?: boolean; project?: string } => ({
    new: s.new === true || s.new === "true" ? true : undefined,
    project: typeof s.project === "string" ? s.project : undefined,
  }),
  head: () => pageHead("Contacts", "Manage every customer contact in your workspace."),
  component: Page,
});

const ALL = "__all";

function Page() {
  const s = Route.useSearch();
  const nav = useNavigate();
  const { org, role } = useOrg();
  const [importing, setImporting] = useState(false);
  const projects = useQuery({
    queryKey: ["projects", org.id, "picker"],
    queryFn: async () => {
      const { data, error } = await supabase.from("projects").select("id, name").eq("organization_id", org.id).eq("status", "active").order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  return (
    <>
      <EntityPage table="contacts" title="Contacts" singular="Contact" icon={Users} description="Everyone your team works with, across all projects."
        openNew={s.new} onCloseNew={() => nav({ to: "/contacts", search: { project: s.project } })}
        filter={s.project ? { project_id: s.project } : undefined}
        actions={<>
          <Select value={s.project ?? ALL} onValueChange={(value) => nav({ to: "/contacts", search: { project: value === ALL ? undefined : value } })}>
            <SelectTrigger className="w-48 rounded-xl bg-card" aria-label="Filter by project"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>All projects</SelectItem>
              {projects.data?.map((project) => <SelectItem key={project.id} value={project.id}>{project.name}</SelectItem>)}
            </SelectContent>
          </Select>
          {canWrite(role) && <Button variant="outline" onClick={() => setImporting(true)}><Upload /> Import</Button>}
        </>}
        searchKeys={["first_name", "last_name", "email", "phone", "job_title", "city"]}
        fields={[
          { key: "first_name", label: "First name", required: true }, { key: "last_name", label: "Last name" },
          { key: "email", label: "Email", type: "email" }, { key: "phone", label: "Phone" },
          { key: "job_title", label: "Job title" }, { key: "company_id", label: "Company", type: "ref", refTable: "companies" },
          { key: "project_id", label: "Project", type: "ref", refTable: "projects" },
          { key: "city", label: "City" }, { key: "source", label: "Source", type: "select", options: ["Website", "Referral", "Campaign", "Inbound call", "Import", "Other"].map((v) => ({ value: v, label: v })) },
          { key: "status", label: "Status", type: "select", options: [{ value: "active", label: "Active" }, { value: "inactive", label: "Inactive" }] },
        ]}
        defaults={{ status: "active", project_id: s.project }}
        columns={[
          { key: "name", label: "Name", render: (r) => <div><p className="font-semibold">{String(r.first_name)} {String(r.last_name ?? "")}</p><p className="text-xs text-muted-foreground">{String(r.job_title ?? "")}</p></div> },
          { key: "email", label: "Email" }, { key: "phone", label: "Phone" },
          { key: "project_id", label: "Project", render: (r, refs) => refs.projects?.get(String(r.project_id)) ?? "—" },
          { key: "company_id", label: "Company", render: (r, refs) => refs.companies?.get(String(r.company_id)) ?? "—" },
          { key: "status", label: "Status", render: (r) => <StatusBadge value={r.status} /> },
          { key: "created_at", label: "Added", render: (r) => shortDate(r.created_at) },
        ]}
      />
      <ImportDialog open={importing} onOpenChange={setImporting} projectId={s.project} onDone={(projectId) => nav({ to: "/contacts", search: { project: projectId } })} />
    </>
  );
}
