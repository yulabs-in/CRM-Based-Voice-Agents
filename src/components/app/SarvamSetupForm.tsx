import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, Save } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { useOrg } from "@/lib/org";
import { normalizePhoneNumber } from "@/lib/sarvam-call";
import { saveSarvamWorkspace } from "@/lib/sarvam.functions";

type Agent = { id: string; sarvam_agent_id: string | null; sarvam_connection_id: string | null; sarvam_agent_phone_number: string | null; sarvam_app_version?: number | null };

export function SarvamSetupForm({ agent }: { agent?: Agent }) {
  const { org, role } = useOrg();
  const qc = useQueryClient();
  const saveWorkspace = useServerFn(saveSarvamWorkspace);
  const isAdmin = role === "owner" || role === "admin";
  const orgQ = useQuery({
    queryKey: ["sarvam-org", org.id],
    queryFn: async () => {
      const { data, error } = await supabase.from("organizations").select("sarvam_organization_id, sarvam_workspace_id").eq("id", org.id).single();
      if (error) throw error;
      return data;
    },
  });
  const [f, setF] = useState({ orgId: "", workspaceId: "", agentId: "", version: "", connectionId: "", callerNumber: "" });
  useEffect(() => {
    setF((p) => ({ ...p, orgId: orgQ.data?.sarvam_organization_id ?? "", workspaceId: orgQ.data?.sarvam_workspace_id ?? "" }));
  }, [orgQ.data]);
  useEffect(() => {
    setF((p) => ({ ...p, agentId: agent?.sarvam_agent_id ?? "", version: agent?.sarvam_app_version != null ? String(agent.sarvam_app_version) : "", connectionId: agent?.sarvam_connection_id ?? "", callerNumber: agent?.sarvam_agent_phone_number ?? "" }));
  }, [agent]);

  const save = useMutation({
    mutationFn: async () => {
      if (!agent) throw new Error("Choose a support agent first");
      const caller = f.callerNumber.trim() ? normalizePhoneNumber(f.callerNumber) : "";
      if (f.version.trim() && !Number.isInteger(Number(f.version))) throw new Error("Agent version must be a whole number");
      if (f.callerNumber.trim() && !caller) throw new Error("Enter a valid connected caller number");
      if (isAdmin && (f.orgId.trim() || f.workspaceId.trim())) {
        await saveWorkspace({ data: { organizationId: org.id, sarvamOrganizationId: f.orgId, sarvamWorkspaceId: f.workspaceId } });
      }
      const { error } = await supabase.from("voice_agents").update({
        sarvam_agent_id: f.agentId.trim() || null,
        ...(f.version.trim() ? { sarvam_app_version: Number(f.version) } : {}),
        sarvam_connection_id: f.connectionId.trim() || null,
        sarvam_agent_phone_number: caller || null,
      }).eq("id", agent.id).eq("organization_id", org.id);
      if (error) throw new Error("Could not save agent details");
    },
    onSuccess: () => {
      toast.success("Sarvam details saved");
      void qc.invalidateQueries({ queryKey: ["sarvam-org", org.id] });
      void qc.invalidateQueries({ queryKey: ["support-call-agents", org.id] });
    },
    onError: (e) => toast.error(e.message),
  });

  const field = (id: keyof typeof f, label: string, placeholder: string, disabled = false) => (
    <div className="space-y-1.5">
      <Label htmlFor={`sv-${id}`}>{label}</Label>
      <Input id={`sv-${id}`} value={f[id]} placeholder={placeholder} disabled={disabled} maxLength={200}
        onChange={(e) => setF((p) => ({ ...p, [id]: e.target.value }))} />
    </div>
  );

  return (
    <form className="space-y-3 border-t pt-4" onSubmit={(e) => { e.preventDefault(); save.mutate(); }}>
      <h3 className="text-sm font-semibold">Sarvam setup</h3>
      <div className="grid gap-3 sm:grid-cols-2">
        {field("orgId", "Sarvam organization ID", "org_…", !isAdmin)}
        {field("workspaceId", "Sarvam workspace ID", "ws_…", !isAdmin)}
        {field("agentId", "Agent (app) ID", "app_…")}
        {field("version", "Agent version (optional)", "1")}
        {field("connectionId", "Telephony connection ID", "conn_…")}
        {field("callerNumber", "Connected caller number", "+91…")}
      </div>
      {!isAdmin && <p className="text-xs text-muted-foreground">Only owners and admins can change organization and workspace IDs.</p>}
      <Button type="submit" variant="outline" disabled={save.isPending || !agent}>
        {save.isPending ? <Loader2 className="animate-spin" /> : <Save />} Save Sarvam details
      </Button>
    </form>
  );
}
