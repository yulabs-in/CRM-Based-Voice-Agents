import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Bot, Code2 } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { PageHeader } from "@/components/app/PageHeader";
import { isAdmin, ROLE_LABELS, useOrg, type OrgRole } from "@/lib/org";
import { getUsageSettings, updateUsageSettings } from "@/lib/usage.functions";
import type { UsageRounding } from "@/lib/usage";

export const Route = createFileRoute("/_authenticated/_app/settings")({
  head: () => ({
    meta: [
      { title: "Settings — Yulabs CRM" },
      { name: "description", content: "Organization details and workspace preferences." },
      { property: "og:title", content: "Settings — Yulabs CRM" },
      { property: "og:description", content: "Organization details and workspace preferences." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Settings,
});

const FIELDS = [["name", "Organization name"], ["website", "Website"], ["phone", "Phone"], ["industry", "Industry"], ["business_type", "Business type"], ["country", "Country"], ["timezone", "Timezone"]] as const;
const ASSIGNABLE_ROLES: OrgRole[] = ["sales_rep", "sales_manager", "voice_manager", "admin", "owner"];

function Settings() {
  const { org, role } = useOrg();
  const qc = useQueryClient();
  const admin = isAdmin(role);
  const [f, setF] = useState(() => Object.fromEntries(FIELDS.map(([k]) => [k, org[k] ?? ""])) as Record<string, string>);
  const [busy, setBusy] = useState(false);
  const initialRole = ((org as { meeting_assignment?: { role?: string } }).meeting_assignment?.role as OrgRole | undefined) ?? "sales_rep";
  const [assignRole, setAssignRole] = useState<OrgRole>(ASSIGNABLE_ROLES.includes(initialRole) ? initialRole : "sales_rep");
  const [savingBooking, setSavingBooking] = useState(false);

  async function save(e: FormEvent) {
    e.preventDefault(); setBusy(true);
    const { error } = await supabase.from("organizations").update(f as Record<(typeof FIELDS)[number][0], string>).eq("id", org.id);
    setBusy(false);
    if (error) { toast.error(error.message); return; }
    toast.success("Settings saved");
    qc.invalidateQueries({ queryKey: ["memberships"] });
  }

  async function saveMeetingAssignment(nextRole: OrgRole) {
    setAssignRole(nextRole);
    setSavingBooking(true);
    const { error } = await supabase
      .from("organizations")
      .update({ meeting_assignment: { mode: "deal_owner_then_round_robin", role: nextRole } })
      .eq("id", org.id);
    setSavingBooking(false);
    if (error) { toast.error(error.message); return; }
    toast.success("Consultation assignment updated");
    qc.invalidateQueries({ queryKey: ["memberships"] });
  }
  return (
    <div className="animate-rise space-y-6">
      <PageHeader
        title="Settings"
        description="Manage your organization profile and workspace preferences."
      />
      <form onSubmit={save} className="max-w-2xl rounded-2xl border bg-card p-6 shadow-soft">
        <div className="grid gap-4 sm:grid-cols-2">
          {FIELDS.map(([k, l]) => (
            <div key={k} className="space-y-1.5">
              <Label htmlFor={k}>{l}</Label>
              <Input
                id={k}
                disabled={!admin}
                value={f[k]}
                onChange={(e) => setF({ ...f, [k]: e.target.value })}
                className="rounded-xl"
              />
            </div>
          ))}
        </div>
        {admin && (
          <Button variant="hero" className="mt-6" disabled={busy}>
            Save changes
          </Button>
        )}
      </form>

      {admin && (
        <UsageSettingsSection orgId={org.id} />
      )}

      {admin && (
        <div className="max-w-2xl rounded-2xl border bg-card p-6 shadow-soft space-y-3">
          <div>
            <h2 className="text-base font-semibold">Consultation booking</h2>
            <p className="text-sm text-muted-foreground">
              Choose who receives AI-booked consultations when no deal owner is assigned.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span>Consultations are assigned to: Deal owner, else round-robin among</span>
            <Select
              value={assignRole}
              onValueChange={(v) => void saveMeetingAssignment(v as OrgRole)}
              disabled={savingBooking}
            >
              <SelectTrigger className="w-44 h-9 rounded-xl">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ASSIGNABLE_ROLES.map((r) => (
                  <SelectItem key={r} value={r}>
                    {ROLE_LABELS[r]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      )}

      {admin && (
        <div className="max-w-2xl rounded-2xl border bg-card p-6 shadow-soft flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-base font-semibold">Developer access</h2>
            <p className="text-sm text-muted-foreground">
              Manage REST API keys and MCP server keys for external apps and AI assistants.
            </p>
          </div>
          <div className="flex flex-wrap gap-2 shrink-0">
            <Button variant="outline" size="sm" asChild className="gap-1.5">
              <Link to="/developers/api">
                <Code2 className="h-4 w-4" />
                API
              </Link>
            </Button>
            <Button variant="outline" size="sm" asChild className="gap-1.5">
              <Link to="/developers/mcp">
                <Bot className="h-4 w-4" />
                MCP
              </Link>
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

function UsageSettingsSection({ orgId }: { orgId: string }) {
  const qc = useQueryClient();
  const fetchSettings = useServerFn(getUsageSettings);
  const saveSettings = useServerFn(updateUsageSettings);

  const query = useQuery({
    queryKey: ["usage-settings", orgId],
    queryFn: () => fetchSettings({ data: { organizationId: orgId } }),
  });

  const [costPerMinute, setCostPerMinute] = useState("0");
  const [costPerAttempt, setCostPerAttempt] = useState("0");
  const [monthlyBudget, setMonthlyBudget] = useState("");
  const [hardStop, setHardStop] = useState(false);
  const [rounding, setRounding] = useState<UsageRounding>("per_call_minute");

  useEffect(() => {
    const s = query.data?.settings;
    if (!s) return;
    setCostPerMinute(String(s.cost_per_minute));
    setCostPerAttempt(String(s.cost_per_attempt));
    setMonthlyBudget(s.monthly_budget != null ? String(s.monthly_budget) : "");
    setHardStop(s.hard_stop);
    setRounding(s.rounding);
  }, [query.data]);

  const save = useMutation({
    mutationFn: () =>
      saveSettings({
        data: {
          organizationId: orgId,
          cost_per_minute: Number(costPerMinute) || 0,
          cost_per_attempt: Number(costPerAttempt) || 0,
          monthly_budget: monthlyBudget.trim() ? Number(monthlyBudget) : null,
          hard_stop: hardStop,
          rounding,
        },
      }),
    onSuccess: () => {
      toast.success("Usage & budget settings saved");
      void qc.invalidateQueries({ queryKey: ["usage-settings", orgId] });
      void qc.invalidateQueries({ queryKey: ["usage-dashboard", orgId] });
      void qc.invalidateQueries({ queryKey: ["budget-status", orgId] });
    },
    onError: (err) => toast.error(err.message),
  });

  return (
    <form
      id="usage"
      onSubmit={(e) => {
        e.preventDefault();
        save.mutate();
      }}
      className="max-w-2xl rounded-2xl border bg-card p-6 shadow-soft space-y-5"
    >
      <div>
        <h2 className="text-base font-semibold">Usage &amp; calling budget</h2>
        <p className="text-sm text-muted-foreground">
          Configure INR calling rates, minute rounding, and monthly budget alerts.
        </p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="cost_per_minute">Cost per minute (₹)</Label>
          <Input
            id="cost_per_minute"
            type="number"
            min="0"
            step="0.01"
            value={costPerMinute}
            onChange={(e) => setCostPerMinute(e.target.value)}
            className="rounded-xl"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="cost_per_attempt">Cost per attempt (₹, optional)</Label>
          <Input
            id="cost_per_attempt"
            type="number"
            min="0"
            step="0.01"
            value={costPerAttempt}
            onChange={(e) => setCostPerAttempt(e.target.value)}
            className="rounded-xl"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="monthly_budget">Monthly budget (₹)</Label>
          <Input
            id="monthly_budget"
            type="number"
            min="0"
            step="1"
            placeholder="No budget limit"
            value={monthlyBudget}
            onChange={(e) => setMonthlyBudget(e.target.value)}
            className="rounded-xl"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="usage_rounding">Minute rounding</Label>
          <Select value={rounding} onValueChange={(v) => setRounding(v as UsageRounding)}>
            <SelectTrigger id="usage_rounding" className="rounded-xl">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="per_call_minute">Per-call minute (round up)</SelectItem>
              <SelectItem value="exact">Exact seconds</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="flex items-start justify-between gap-4 rounded-xl border bg-muted/30 p-4">
        <div className="space-y-1">
          <Label htmlFor="hard_stop" className="font-medium">
            Hard stop on new campaigns
          </Label>
          <p className="text-xs text-muted-foreground">
            When the month&apos;s estimated spend reaches the budget, new campaigns can&apos;t be launched. Running campaigns and test calls are not affected.
          </p>
        </div>
        <Switch id="hard_stop" checked={hardStop} onCheckedChange={setHardStop} />
      </div>

      <Button variant="hero" type="submit" disabled={save.isPending}>
        Save usage settings
      </Button>
    </form>
  );
}
