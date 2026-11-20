import { useMemo, useState, type FormEvent, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Download, Loader2, MoreHorizontal, Pencil, Plus, Search, Trash2, type LucideIcon } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { canDelete, canWrite, useOrg } from "@/lib/org";
import { downloadCsv } from "@/lib/csv";
import { PageHeader } from "./PageHeader";

export type Row = Record<string, unknown> & { id: string };
export type Field = {
  key: string; label: string; type?: "text" | "email" | "number" | "date" | "datetime" | "textarea" | "select" | "ref";
  options?: { value: string; label: string }[]; required?: boolean; refTable?: RefTable; full?: boolean;
};
export type Column = { key: string; label: string; render?: (r: Row, refs: Refs) => React.ReactNode; className?: string };
type Refs = Record<string, Map<string, string>>;
export type RefTable = "contacts" | "companies" | "deals" | "voice_agents" | "call_campaigns" | "projects";
type Table = "contacts" | "companies" | "leads" | "deals" | "tasks" | "voice_agents" | "call_campaigns" | "calls" | "workflows" | "messages" | "meetings";

const refLabel = (t: string, r: Record<string, unknown>) =>
  t === "contacts" ? `${r.first_name ?? ""} ${r.last_name ?? ""}`.trim() : String(r.name ?? r.title ?? "");

export function useRefs(tables: RefTable[]) {
  const { org } = useOrg();
  return useQuery({
    queryKey: ["refs", org.id, tables.join()],
    enabled: tables.length > 0,
    queryFn: async () => {
      const out: Refs = {};
      for (const t of tables) {
        const cols = t === "contacts" ? "id, first_name, last_name" : t === "deals" ? "id, title" : "id, name";
        const { data } = await supabase.from(t).select(cols).eq("organization_id", org.id).limit(1000);
        out[t] = new Map(((data ?? []) as unknown as Record<string, unknown>[]).map((r) => [String(r.id), refLabel(t, r)]));
      }
      return out;
    },
  });
}

export function EntityPage(props: {
  table: Table; title: string; description: string; singular: string; icon: LucideIcon;
  fields: Field[]; columns: Column[]; searchKeys: string[]; defaults?: Record<string, unknown>;
  openNew?: boolean; onCloseNew?: () => void; order?: string; filter?: Record<string, string>; readOnly?: boolean;
  actions?: ReactNode; onRowClick?: (row: Row) => void; select?: string;
}) {
  const { org, role: realRole } = useOrg();
  const role = props.readOnly ? "read_only" : realRole;
  const qc = useQueryClient();
  const [q, setQ] = useState("");
  const [editing, setEditing] = useState<Row | null>(null);
  const [creating, setCreating] = useState(!!props.openNew && canWrite(role));
  const refTables = [...new Set(props.fields.filter((f) => f.refTable).map((f) => f.refTable!))];
  const refs = useRefs(refTables);
  const key = [props.table, org.id, JSON.stringify(props.filter ?? {})];

  const list = useQuery({
    queryKey: key,
    queryFn: async () => {
      let qb = supabase.from(props.table).select(props.select ?? "*").eq("organization_id", org.id);
      for (const [k, v] of Object.entries(props.filter ?? {})) qb = qb.eq(k as never, v as never);
      const { data, error } = await qb.order(props.order ?? "created_at", { ascending: false }).limit(1000);
      if (error) throw error;
      return data as unknown as Row[];
    },
  });

  const save = useMutation({
    mutationFn: async (vals: Record<string, unknown>) => {
      const payload = { ...(editing ? {} : props.filter), ...vals, organization_id: org.id };
      const res = editing
        ? await supabase.from(props.table).update(payload as never).eq("id", editing.id)
        : await supabase.from(props.table).insert(payload as never);
      if (res.error) throw res.error;
    },
    onSuccess: () => {
      toast.success(`${props.singular} ${editing ? "updated" : "created"}`);
      qc.invalidateQueries({ queryKey: [props.table] }); qc.invalidateQueries({ queryKey: ["refs"] }); qc.invalidateQueries({ queryKey: ["stats"] });
      close();
    },
    onError: (e) => toast.error(e.message),
  });

  const del = useMutation({
    mutationFn: async (id: string) => { const { error } = await supabase.from(props.table).delete().eq("id", id); if (error) throw error; },
    onSuccess: () => { toast.success(`${props.singular} deleted`); qc.invalidateQueries({ queryKey: [props.table] }); qc.invalidateQueries({ queryKey: ["stats"] }); },
    onError: (e) => toast.error(e.message),
  });

  function close() { setEditing(null); setCreating(false); props.onCloseNew?.(); }

  const rows = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return list.data ?? [];
    return (list.data ?? []).filter((r) => props.searchKeys.some((k) => String(r[k] ?? "").toLowerCase().includes(s)));
  }, [q, list.data, props.searchKeys]);

  const refMap = refs.data ?? {};

  return (
    <div className="animate-rise space-y-5">
      <PageHeader title={props.title} description={props.description}>
        {props.actions}
        <Button variant="outline" onClick={() => downloadCsv(`${props.table}.csv`, rows)} disabled={!rows.length}><Download /> Export</Button>
        {canWrite(role) && <Button variant="hero" onClick={() => setCreating(true)}><Plus /> New {props.singular.toLowerCase()}</Button>}
      </PageHeader>

      <div className="rounded-2xl border bg-card shadow-soft">
        <div className="flex items-center gap-3 border-b p-3">
          <div className="relative w-full max-w-xs">
            <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder={`Search ${props.title.toLowerCase()}…`} className="h-9 rounded-xl pl-9" />
          </div>
          <span className="ml-auto text-xs text-muted-foreground">{rows.length} {rows.length === 1 ? "record" : "records"}</span>
        </div>
        {list.isLoading ? (
          <div className="space-y-2 p-4">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-10 w-full rounded-lg" />)}</div>
        ) : rows.length === 0 ? (
          <div className="dot-canvas m-3 rounded-xl border border-dashed py-16 text-center">
            <span className="mx-auto grid size-12 place-items-center rounded-2xl bg-accent text-accent-foreground"><props.icon /></span>
            <p className="mt-4 font-semibold">{q ? "No matches" : `No ${props.title.toLowerCase()} yet`}</p>
            <p className="mt-1 text-sm text-muted-foreground">{q ? "Try a different search." : `Add your first ${props.singular.toLowerCase()} to get started.`}</p>
            {!q && canWrite(role) && <Button variant="hero" className="mt-5" onClick={() => setCreating(true)}><Plus /> New {props.singular.toLowerCase()}</Button>}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="border-b text-left text-xs uppercase tracking-wide text-muted-foreground">
                {props.columns.map((c) => <th key={c.key} className="px-4 py-2.5 font-semibold">{c.label}</th>)}
                <th className="w-10" />
              </tr></thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} className={"border-b last:border-0 transition-colors hover:bg-muted/60" + (props.onRowClick ? " cursor-pointer" : "")} onClick={() => props.onRowClick?.(r)}>
                    {props.columns.map((c) => <td key={c.key} className={c.className ?? "px-4 py-3"}>{c.render ? c.render(r, refMap) : String(r[c.key] ?? "—")}</td>)}
                    <td className="pr-3" onClick={(event) => event.stopPropagation()}>
                      {canWrite(role) && (
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild><Button variant="ghost" size="icon" aria-label="Actions"><MoreHorizontal /></Button></DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => setEditing(r)}><Pencil /> Edit</DropdownMenuItem>
                            {canDelete(role) && <DropdownMenuItem className="text-destructive" onClick={() => confirm(`Delete this ${props.singular.toLowerCase()}?`) && del.mutate(r.id)}><Trash2 /> Delete</DropdownMenuItem>}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <Dialog open={creating || !!editing} onOpenChange={(o) => !o && close()}>
        <DialogContent className="max-h-[90vh] overflow-y-auto rounded-2xl sm:max-w-xl">
          <DialogHeader><DialogTitle>{editing ? `Edit ${props.singular.toLowerCase()}` : `New ${props.singular.toLowerCase()}`}</DialogTitle></DialogHeader>
          <EntityForm key={editing?.id ?? "new"} fields={props.fields} initial={editing ?? props.defaults ?? {}} refs={refMap} busy={save.isPending} onSubmit={(v) => save.mutate(v)} onCancel={close} />
        </DialogContent>
      </Dialog>
    </div>
  );
}

function EntityForm({ fields, initial, refs, busy, onSubmit, onCancel }: { fields: Field[]; initial: Record<string, unknown>; refs: Refs; busy: boolean; onSubmit: (v: Record<string, unknown>) => void; onCancel: () => void }) {
  const [vals, setVals] = useState<Record<string, unknown>>(() => Object.fromEntries(fields.map((f) => {
    const v = initial[f.key];
    if (f.type === "datetime" && typeof v === "string") return [f.key, v.slice(0, 16)];
    return [f.key, v ?? ""];
  })));
  function submit(e: FormEvent) {
    e.preventDefault();
    const out: Record<string, unknown> = {};
    for (const f of fields) {
      const v = vals[f.key];
      if (v === "" || v === undefined) out[f.key] = f.type === "number" ? 0 : null;
      else if (f.type === "number") out[f.key] = Number(v);
      else if (f.type === "datetime") out[f.key] = new Date(String(v)).toISOString();
      else out[f.key] = v;
    }
    onSubmit(out);
  }
  return (
    <form onSubmit={submit} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        {fields.map((f) => {
          const set = (v: unknown) => setVals((s) => ({ ...s, [f.key]: v }));
          const val = String(vals[f.key] ?? "");
          return (
            <div key={f.key} className={f.full || f.type === "textarea" ? "space-y-1.5 sm:col-span-2" : "space-y-1.5"}>
              <Label htmlFor={f.key}>{f.label}{f.required && " *"}</Label>
              {f.type === "textarea" ? <Textarea id={f.key} value={val} onChange={(e) => set(e.target.value)} className="rounded-xl" />
                : f.type === "select" || f.type === "ref" ? (
                  <Select value={val || "__none"} onValueChange={(v) => set(v === "__none" ? "" : v)}>
                    <SelectTrigger id={f.key} className="rounded-xl"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {f.type === "ref" && <SelectItem value="__none">None</SelectItem>}
                      {(f.type === "ref" ? [...(refs[f.refTable!] ?? new Map()).entries()].map(([value, label]) => ({ value, label })) : f.options ?? []).map((o) => (
                        <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : (
                  <Input id={f.key} required={f.required} value={val} onChange={(e) => set(e.target.value)} className="rounded-xl"
                    type={f.type === "datetime" ? "datetime-local" : f.type ?? "text"} min={f.type === "number" ? 0 : undefined} />
                )}
            </div>
          );
        })}
      </div>
      <DialogFooter>
        <Button type="button" variant="ghost" onClick={onCancel}>Cancel</Button>
        <Button type="submit" variant="hero" disabled={busy}>{busy && <Loader2 className="animate-spin" />} Save</Button>
      </DialogFooter>
    </form>
  );
}
