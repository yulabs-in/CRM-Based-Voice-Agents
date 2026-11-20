import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { runImportAutomations } from "@/lib/automation.functions";
import { FileSpreadsheet, Loader2, Upload } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { useOrg } from "@/lib/org";
import { buildContacts, guessMapping, parseFile, TARGET_LABELS, type ContactTarget, type Mapping, type ParsedSheet } from "@/lib/import";

const BATCH = 500;
const NEW = "__new";

type Props = { open: boolean; onOpenChange: (open: boolean) => void; projectId?: string; onDone?: (projectId: string) => void };

export function ImportDialog({ open, onOpenChange, projectId: fixedProjectId, onDone }: Props) {
  const { org } = useOrg();
  const qc = useQueryClient();
  const runAutomations = useServerFn(runImportAutomations);
  const [file, setFile] = useState<File | null>(null);
  const [sheet, setSheet] = useState<ParsedSheet | null>(null);
  const [mapping, setMapping] = useState<Mapping>({});
  const [projectChoice, setProjectChoice] = useState<string>(fixedProjectId ?? NEW);
  const [projectName, setProjectName] = useState("");
  const [parsing, setParsing] = useState(false);
  const [progress, setProgress] = useState<number | null>(null);

  const projects = useQuery({
    queryKey: ["projects", org.id, "picker"],
    enabled: open && !fixedProjectId,
    queryFn: async () => {
      const { data, error } = await supabase.from("projects").select("id, name").eq("organization_id", org.id).eq("status", "active").order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const built = useMemo(() => (sheet ? buildContacts(sheet, mapping) : null), [sheet, mapping]);
  const hasContactKey = Object.values(mapping).some((target) => target === "phone" || target === "email");

  function reset() {
    setFile(null); setSheet(null); setMapping({}); setProjectName(""); setProgress(null); setProjectChoice(fixedProjectId ?? NEW);
  }

  async function choose(selected: File | undefined) {
    if (!selected) return;
    setParsing(true);
    try {
      const parsed = await parseFile(selected);
      setFile(selected);
      setSheet(parsed);
      setMapping(guessMapping(parsed.headers));
      if (!projectName) setProjectName(selected.name.replace(/\.[^.]+$/, "").replace(/[_-]+/g, " ").slice(0, 80));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not read that file");
    } finally {
      setParsing(false);
    }
  }

  async function runImport() {
    if (!sheet || !file || !built) return;
    if (!built.contacts.length) { toast.error("No rows have a valid phone or email to import"); return; }
    setProgress(0);
    let projectId = fixedProjectId ?? (projectChoice === NEW ? null : projectChoice);
    try {
      if (!projectId) {
        const name = projectName.trim();
        if (!name) throw new Error("Give the new project a name");
        const { data, error } = await supabase.from("projects").insert({ organization_id: org.id, name, source: sheet.fileType }).select("id").single();
        if (error || !data) throw new Error(error?.message ?? "Could not create the project");
        projectId = data.id;
      }
      const { data: importRow, error: importError } = await supabase.from("imports").insert({
        organization_id: org.id, project_id: projectId, file_name: file.name, file_type: sheet.fileType,
        column_mapping: mapping, total_rows: sheet.rows.length,
      }).select("id").single();
      if (importError || !importRow) throw new Error(importError?.message ?? "Could not start the import");

      const path = `${org.id}/${importRow.id}/${file.name.replace(/[^\w.-]+/g, "_")}`;
      const upload = await supabase.storage.from("imports").upload(path, file, { upsert: true });

      let inserted = 0;
      const importedIds: string[] = [];
      const failures: { row: number; reason: string }[] = [];
      for (let start = 0; start < built.contacts.length; start += BATCH) {
        const chunk = built.contacts.slice(start, start + BATCH).map((contact) => ({ ...contact, organization_id: org.id, project_id: projectId }));
        const withPhone = chunk.filter((contact) => contact.phone);
        const withoutPhone = chunk.filter((contact) => !contact.phone);
        const results = await Promise.all([
          withPhone.length ? supabase.from("contacts").upsert(withPhone, { onConflict: "project_id,phone" }).select("id") : null,
          withoutPhone.length ? supabase.from("contacts").insert(withoutPhone).select("id") : null,
        ]);
        const failed = results.find((result) => result?.error);
        if (failed?.error) failures.push({ row: start + 2, reason: `Rows ${start + 2}–${start + 1 + chunk.length}: ${failed.error.message}` });
        else {
          inserted += chunk.length;
          for (const result of results) for (const row of result?.data ?? []) importedIds.push(row.id);
        }
        setProgress(Math.round(((start + chunk.length) / built.contacts.length) * 100));
      }

      const errors = [...built.issues, ...failures].slice(0, 500);
      await supabase.from("imports").update({
        file_path: upload.error ? null : path, inserted, skipped: sheet.rows.length - inserted, errors,
        status: inserted ? "completed" : "failed", updated_at: new Date().toISOString(),
      }).eq("id", importRow.id);

      void qc.invalidateQueries({ queryKey: ["projects"] });
      void qc.invalidateQueries({ queryKey: ["contacts"] });
      void qc.invalidateQueries({ queryKey: ["imports"] });
      void qc.invalidateQueries({ queryKey: ["stats"] });
      if (!inserted) throw new Error(failures[0]?.reason ?? "Nothing was imported");
      // "Contacts imported" workflows (e.g. auto-call new leads) — best effort, never blocks the import.
      void runAutomations({ data: { organizationId: org.id, projectId, contactIds: importedIds } }).catch(() => undefined);
      toast.success(`Imported ${inserted.toLocaleString()} contacts${errors.length ? ` · ${errors.length} rows skipped` : ""}`);
      onOpenChange(false);
      reset();
      onDone?.(projectId);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Import failed");
      setProgress(null);
    }
  }

  const busy = progress !== null;

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!busy) { onOpenChange(next); if (!next) reset(); } }}>
      <DialogContent className="max-h-[92vh] max-w-[calc(100vw-1.5rem)] overflow-y-auto rounded-2xl sm:max-w-4xl [&>*]:min-w-0">
        <DialogHeader>
          <DialogTitle>Import contacts from CSV or Excel</DialogTitle>
          <DialogDescription>Each row becomes a CRM contact in a project. Columns we don't recognise are kept as custom fields, and the original file is stored with the import.</DialogDescription>
        </DialogHeader>

        {!sheet ? (
          <label className="dot-canvas flex cursor-pointer flex-col items-center justify-center gap-3 rounded-xl border border-dashed py-14 text-center">
            {parsing ? <Loader2 className="size-8 animate-spin text-muted-foreground" /> : <FileSpreadsheet className="size-8 text-muted-foreground" />}
            <span className="font-semibold">{parsing ? "Reading file…" : "Choose a .csv or .xlsx file"}</span>
            <span className="text-sm text-muted-foreground">First row must be column headers · up to 50,000 rows</span>
            <input type="file" accept=".csv,.tsv,.txt,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" className="sr-only"
              disabled={parsing} onChange={(event) => void choose(event.target.files?.[0])} />
          </label>
        ) : (
          <div className="space-y-5">
            <div className="flex flex-wrap items-center gap-3 rounded-xl border bg-muted/40 p-3 text-sm">
              <FileSpreadsheet className="size-5" />
              <span className="font-semibold">{file?.name}</span>
              <span className="text-muted-foreground">{sheet.rows.length.toLocaleString()} {sheet.rows.length === 1 ? "row" : "rows"} · {sheet.headers.length} columns</span>
              {!busy && <Button size="sm" variant="ghost" className="ml-auto" onClick={reset}>Choose another file</Button>}
            </div>

            {!fixedProjectId && (
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="import-project">Project</Label>
                  <Select value={projectChoice} onValueChange={setProjectChoice} disabled={busy}>
                    <SelectTrigger id="import-project" className="rounded-xl"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value={NEW}>+ Create a new project</SelectItem>
                      {projects.data?.map((project) => <SelectItem key={project.id} value={project.id}>{project.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                {projectChoice === NEW && (
                  <div className="space-y-1.5">
                    <Label htmlFor="import-project-name">New project name</Label>
                    <Input id="import-project-name" className="rounded-xl" value={projectName} maxLength={80} disabled={busy} onChange={(event) => setProjectName(event.target.value)} />
                  </div>
                )}
              </div>
            )}

            <div>
              <p className="mb-2 text-sm font-semibold">Match columns to contact fields</p>
              <div className="overflow-x-auto rounded-xl border">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
                      {sheet.headers.map((header) => <th key={header} className="min-w-44 px-3 py-2 font-semibold">{header}</th>)}
                    </tr>
                    <tr className="border-b">
                      {sheet.headers.map((header) => (
                        <th key={header} className="px-2 py-2">
                          <Select value={mapping[header] ?? "custom"} disabled={busy} onValueChange={(value) => setMapping((current) => ({ ...current, [header]: value as ContactTarget }))}>
                            <SelectTrigger className="h-8 rounded-lg text-xs" aria-label={`Field for ${header}`}><SelectValue /></SelectTrigger>
                            <SelectContent>
                              {(Object.keys(TARGET_LABELS) as ContactTarget[]).map((target) => <SelectItem key={target} value={target}>{TARGET_LABELS[target]}</SelectItem>)}
                            </SelectContent>
                          </Select>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {sheet.rows.slice(0, 8).map((row, rowIndex) => (
                      <tr key={rowIndex} className="border-b last:border-0">
                        {row.map((value, cellIndex) => <td key={cellIndex} className="max-w-56 truncate px-3 py-1.5 text-muted-foreground">{value}</td>)}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {!hasContactKey && <p className="mt-2 text-sm text-destructive">Map at least one column to Phone (needed for calling campaigns) or Email.</p>}
            </div>

            {built && (
              <div className="grid gap-3 sm:grid-cols-3">
                <Stat label="Ready to import" value={built.contacts.length} />
                <Stat label="With a callable phone" value={built.contacts.filter((contact) => contact.phone).length} />
                <Stat label="Skipped rows" value={built.issues.length} tone={built.issues.length ? "warn" : undefined} />
              </div>
            )}
            {built && built.issues.length > 0 && (
              <details className="rounded-xl border p-3 text-sm">
                <summary className="cursor-pointer font-semibold">Why rows will be skipped ({built.issues.length})</summary>
                <ul className="mt-2 max-h-40 space-y-1 overflow-y-auto text-muted-foreground">
                  {built.issues.slice(0, 200).map((issue) => <li key={`${issue.row}-${issue.reason}`}>Row {issue.row}: {issue.reason}</li>)}
                </ul>
              </details>
            )}
            {busy && <div className="space-y-1.5"><Progress value={progress} /><p className="text-xs text-muted-foreground">Saving contacts… {progress}%</p></div>}
          </div>
        )}

        <DialogFooter>
          <Button variant="ghost" disabled={busy} onClick={() => { onOpenChange(false); reset(); }}>Cancel</Button>
          <Button variant="hero" disabled={!sheet || !hasContactKey || busy || !built?.contacts.length} onClick={() => void runImport()}>
            {busy ? <Loader2 className="animate-spin" /> : <Upload />} Import {built?.contacts.length ? built.contacts.length.toLocaleString() : ""} contacts
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Stat({ label, value, tone }: { label: string; value: number; tone?: "warn" }) {
  return (
    <div className="rounded-xl border bg-card p-3">
      <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className={tone === "warn" ? "mt-1 text-xl font-bold text-warning" : "mt-1 text-xl font-bold"}>{value.toLocaleString()}</p>
    </div>
  );
}
