import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Loader2, RotateCcw, SlidersHorizontal } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useOrg } from "@/lib/org";
import { asVariableMap } from "@/lib/campaign-vars";
import { humanize } from "@/lib/sarvam-call";
import { DEFAULT_DISPOSITIONS, defaultRuleFor, normDisposition, type OutcomeRule } from "@/lib/outcome-rules";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";

type RuleRow = OutcomeRule & { custom: boolean };

type AgentLike = {
  id: string;
  name?: unknown;
  agent_variables?: unknown;
  lead_columns?: unknown;
};

const LEAD_STATUS_OPTIONS = [
  { value: "new", label: "New" },
  { value: "contacted", label: "Contacted" },
  { value: "qualified", label: "Qualified" },
  { value: "unqualified", label: "Unqualified" },
  { value: "converted", label: "Converted" },
];

const DEAL_STAGE_OPTIONS = [
  { value: "__none__", label: "No deal" },
  { value: "qualification", label: "Qualification" },
  { value: "proposal", label: "Proposal" },
  { value: "negotiation", label: "Negotiation" },
  { value: "won", label: "Won" },
  { value: "lost", label: "Lost" },
];

const SUGGESTED_LEAD_COLUMNS = [
  "vehicle_model", "family_size", "current_insurer", "renewal_date",
  "trading_style", "experience_level", "consultation_mode", "preferred_language",
  "insurance_type", "market_interest", "product", "service_interest",
];

const canEditRules = (role?: string) => role === "owner" || role === "admin" || role === "voice_manager";

function mergeRules(saved: OutcomeRule[] | undefined): RuleRow[] {
  const byKey = new Map((saved ?? []).map((r) => [normDisposition(r.disposition), r]));
  const dispositions = [...DEFAULT_DISPOSITIONS];
  for (const r of saved ?? []) {
    const key = normDisposition(r.disposition);
    if (!dispositions.some((d) => normDisposition(d) === key)) dispositions.push(key as (typeof DEFAULT_DISPOSITIONS)[number]);
  }
  return dispositions.map((disposition) => {
    const key = normDisposition(disposition);
    const savedRule = byKey.get(key);
    if (savedRule) return { ...savedRule, disposition: key, custom: true };
    return { ...defaultRuleFor(key), custom: false };
  });
}

function normalizeLeadColumns(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((v) => String(v).trim()).filter(Boolean);
}

export function OutcomeRulesDialog({ agent, open, onOpenChange }: { agent: AgentLike | null; open: boolean; onOpenChange: (open: boolean) => void }) {
  const { org, role } = useOrg();
  const qc = useQueryClient();
  const editable = canEditRules(role);
  const agentId = agent?.id ?? "";

  const rulesQuery = useQuery({
    queryKey: ["agent-outcome-rules", agentId],
    enabled: open && !!agentId,
    queryFn: async () => {
      const { data, error } = await supabase.from("agent_outcome_rules").select("*").eq("agent_id", agentId);
      if (error) throw error;
      return (data ?? []) as unknown as OutcomeRule[];
    },
  });

  const initialRows = useMemo(() => mergeRules(rulesQuery.data), [rulesQuery.data]);
  const [rows, setRows] = useState<RuleRow[]>([]);
  const [leadColumns, setLeadColumns] = useState<string[]>([]);
  const [newColumn, setNewColumn] = useState("");

  useEffect(() => {
    if (!open) return;
    setRows(initialRows);
    setLeadColumns(normalizeLeadColumns(agent?.lead_columns));
    setNewColumn("");
  }, [open, initialRows, agent?.lead_columns]);

  const answerKeyOptions = useMemo(() => {
    const keys = new Set<string>(SUGGESTED_LEAD_COLUMNS);
    for (const k of Object.keys(asVariableMap(agent?.agent_variables))) keys.add(k);
    for (const k of leadColumns) keys.add(k);
    return [...keys].filter(Boolean).sort();
  }, [agent?.agent_variables, leadColumns]);

  const save = useMutation({
    mutationFn: async () => {
      const customRows = rows.filter((r) => r.custom);
      // Replace custom rules for this agent: delete removed ones, upsert current custom ones.
      const { error: delError } = await supabase.from("agent_outcome_rules").delete().eq("agent_id", agentId);
      if (delError) throw delError;
      if (customRows.length > 0) {
        const payload = customRows.map((r) => ({
          organization_id: org.id,
          agent_id: agentId,
          disposition: normDisposition(r.disposition),
          lead_status: r.lead_status,
          deal_stage: r.deal_stage,
          probability: r.probability ?? 0,
          create_lead: r.create_lead,
          create_task: r.create_task,
          block_contact: r.block_contact,
          updated_at: new Date().toISOString(),
        }));
        const { error: insError } = await supabase.from("agent_outcome_rules").insert(payload as never);
        if (insError) throw insError;
      }
      const { error: colError } = await supabase.from("voice_agents")
        .update({ lead_columns: leadColumns } as never)
        .eq("id", agentId);
      if (colError) throw colError;
    },
    onSuccess: () => {
      toast.success("Outcome rules saved");
      qc.invalidateQueries({ queryKey: ["agent-outcome-rules", agentId] });
      qc.invalidateQueries({ queryKey: ["voice_agents"] });
      onOpenChange(false);
    },
    onError: (e) => toast.error(e.message),
  });

  const resetDefaults = () => {
    if (!confirm("Reset all custom outcome rules for this agent to defaults?")) return;
    setRows(mergeRules([]));
  };

  const updateRow = (disposition: string, patch: Partial<RuleRow>) => {
    setRows((prev) => prev.map((r) => normDisposition(r.disposition) === normDisposition(disposition) ? { ...r, ...patch, custom: true } : r));
  };

  const toggleColumn = (key: string) => {
    setLeadColumns((prev) => prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]);
  };

  const addColumn = () => {
    const key = newColumn.trim().toLowerCase().replace(/\s+/g, "_");
    if (!key || leadColumns.includes(key)) { setNewColumn(""); return; }
    setLeadColumns((prev) => [...prev, key]);
    setNewColumn("");
  };

  const agentName = String(agent?.name ?? "Agent");

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] overflow-y-auto rounded-2xl sm:max-w-5xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><SlidersHorizontal className="size-4" /> Outcome rules — {agentName}</DialogTitle>
          <DialogDescription>
            Decide how call dispositions from this agent change leads and deals. Custom rules override defaults for this agent only.
          </DialogDescription>
        </DialogHeader>

        {rulesQuery.isLoading ? (
          <div className="space-y-2 py-4">{Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-10 w-full rounded-lg" />)}</div>
        ) : (
          <div className="space-y-6">
            <div className="overflow-x-auto rounded-xl border">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/30 text-left text-xs uppercase tracking-wide text-muted-foreground">
                    <th className="px-3 py-2 font-semibold">Disposition</th>
                    <th className="px-3 py-2 font-semibold">Lead status</th>
                    <th className="px-3 py-2 font-semibold">Deal stage</th>
                    <th className="px-3 py-2 font-semibold">Probability</th>
                    <th className="px-3 py-2 font-semibold">Create lead</th>
                    <th className="px-3 py-2 font-semibold">Create task</th>
                    <th className="px-3 py-2 font-semibold">Block contact</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => {
                    const key = normDisposition(r.disposition);
                    return (
                      <tr key={key} className={"border-b last:border-0 " + (r.custom ? "" : "text-muted-foreground")}>
                        <td className="px-3 py-2">
                          <div className="flex items-center gap-2">
                            <span className="font-medium text-foreground">{humanize(key)}</span>
                            {!r.custom && <Badge variant="outline" className="text-[10px]">Default</Badge>}
                          </div>
                        </td>
                        <td className="px-3 py-2">
                          <Select value={r.lead_status ?? "contacted"} disabled={!editable} onValueChange={(v) => updateRow(key, { lead_status: v as OutcomeRule["lead_status"] })}>
                            <SelectTrigger className="h-8 w-[140px] rounded-lg"><SelectValue /></SelectTrigger>
                            <SelectContent>{LEAD_STATUS_OPTIONS.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}</SelectContent>
                          </Select>
                        </td>
                        <td className="px-3 py-2">
                          <Select value={r.deal_stage ?? "__none__"} disabled={!editable} onValueChange={(v) => updateRow(key, { deal_stage: v === "__none__" ? null : v as OutcomeRule["deal_stage"] })}>
                            <SelectTrigger className="h-8 w-[150px] rounded-lg"><SelectValue /></SelectTrigger>
                            <SelectContent>{DEAL_STAGE_OPTIONS.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}</SelectContent>
                          </Select>
                        </td>
                        <td className="px-3 py-2">
                          <Input type="number" min={0} max={100} disabled={!editable} value={r.probability ?? 0}
                            onChange={(e) => updateRow(key, { probability: Math.max(0, Math.min(100, Number(e.target.value || 0))) })}
                            className="h-8 w-20 rounded-lg" />
                        </td>
                        <td className="px-3 py-2"><Switch checked={r.create_lead} disabled={!editable} onCheckedChange={(v) => updateRow(key, { create_lead: v })} /></td>
                        <td className="px-3 py-2"><Switch checked={r.create_task} disabled={!editable} onCheckedChange={(v) => updateRow(key, { create_task: v })} /></td>
                        <td className="px-3 py-2"><Switch checked={r.block_contact} disabled={!editable} onCheckedChange={(v) => updateRow(key, { block_contact: v })} /></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className="space-y-3 rounded-xl border p-4">
              <div>
                <Label className="text-sm font-semibold">Show on Leads page</Label>
                <p className="text-xs text-muted-foreground">Answer keys shown as details for leads from this agent. Leave empty to use the default columns.</p>
              </div>
              <div className="flex flex-wrap gap-2">
                {answerKeyOptions.map((key) => {
                  const active = leadColumns.includes(key);
                  return (
                    <button key={key} type="button" disabled={!editable} onClick={() => toggleColumn(key)}
                      className={"rounded-full border px-2.5 py-1 text-xs font-medium transition-colors " + (active ? "border-primary bg-primary/10 text-primary" : "text-muted-foreground hover:text-foreground")}>
                      {humanize(key)}
                    </button>
                  );
                })}
              </div>
              {editable && (
                <div className="flex max-w-sm gap-2">
                  <Input value={newColumn} onChange={(e) => setNewColumn(e.target.value)} placeholder="Add answer key (e.g. insurance_type)" className="h-9 rounded-lg"
                    onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addColumn(); } }} />
                  <Button type="button" variant="outline" onClick={addColumn}>Add</Button>
                </div>
              )}
              {leadColumns.length > 0 && <p className="text-xs text-muted-foreground">Selected: {leadColumns.map(humanize).join(", ")}</p>}
            </div>
          </div>
        )}

        <DialogFooter className="gap-2 sm:justify-between">
          <div>
            {editable && <Button type="button" variant="ghost" onClick={resetDefaults} disabled={save.isPending}><RotateCcw /> Reset to defaults</Button>}
          </div>
          <div className="flex gap-2">
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
            {editable && <Button type="button" variant="hero" onClick={() => save.mutate()} disabled={save.isPending || rulesQuery.isLoading}>
              {save.isPending && <Loader2 className="animate-spin" />} Save
            </Button>}
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
