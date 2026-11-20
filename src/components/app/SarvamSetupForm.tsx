import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, RotateCcw, Save } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { useOrg } from "@/lib/org";
import { normalizePhoneNumber } from "@/lib/sarvam-call";
import { saveSarvamWorkspace } from "@/lib/sarvam.functions";
import { DEFAULT_AGENT, SARVAM_DEFAULTS } from "@/lib/sarvam-defaults";

type Agent = { id: string; sarvam_agent_id: string | null; sarvam_connection_id: string | null; sarvam_agent_phone_number: string | null; sarvam_app_version?: number | null };
type Form = { orgId: string; workspaceId: string; agentId: string; version: string; connectionId: string; callerNumber: string };

const DEFAULT_FORM: Form = {
  orgId: SARVAM_DEFAULTS.organizationId,
  workspaceId: SARVAM_DEFAULTS.workspaceId,
  agentId: SARVAM_DEFAULTS.agentId,
  version: String(SARVAM_DEFAULTS.agentVersion),
  connectionId: SARVAM_DEFAULTS.connectionId,
  callerNumber: SARVAM_DEFAULTS.callerNumber,
};

/** Sarvam IDs for the workspace and the selected agent. Empty values fall back to the built-in defaults; with no agent yet, saving creates one. */
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
  const [f, setF] = useState<Form>(DEFAULT_FORM);
  useEffect(() => {
    setF((p) => ({
      ...p,
      orgId: orgQ.data?.sarvam_organization_id?.trim() || DEFAULT_FORM.orgId,
      workspaceId: orgQ.data?.sarvam_workspace_id?.trim() || DEFAULT_FORM.workspaceId,
    }));
  }, [orgQ.data]);
  useEffect(() => {
    setF((p) => ({
      ...p,
      agentId: agent?.sarvam_agent_id?.trim() || DEFAULT_FORM.agentId,
      version: agent?.sarvam_app_version != null ? String(agent.sarvam_app_version) : DEFAULT_FORM.version,
      connectionId: agent?.sarvam_connection_id?.trim() || DEFAULT_FORM.connectionId,
      callerNumber: agent?.sarvam_agent_phone_number?.trim() || DEFAULT_FORM.callerNumber,
    }));
  }, [agent]);

  const save = useMutation({
    mutationFn: async () => {
      const caller = normalizePhoneNumber(f.callerNumber);
      if (!caller) throw new Error("Enter a valid connected caller number (e.g. +91 80642 69483)");
      if (!Number.isInteger(Number(f.version)) || Number(f.version) < 1) throw new Error("Agent version must be a whole number");
      if (!f.agentId.trim() || !f.connectionId.trim()) throw new Error("Agent ID and telephony connection ID are required");
      if (isAdmin && f.orgId.trim() && f.workspaceId.trim()) {
        await saveWorkspace({ data: { organizationId: org.id, sarvamOrganizationId: f.orgId.trim(), sarvamWorkspaceId: f.workspaceId.trim() } });
      }
      const details = {
        sarvam_agent_id: f.agentId.trim(),
        sarvam_app_version: Number(f.version),
        sarvam_connection_id: f.connectionId.trim(),
        sarvam_agent_phone_number: caller,
      };
      const { error } = agent
        ? await supabase.from("voice_agents").update(details).eq("id", agent.id).eq("organization_id", org.id)
        : await supabase.from("voice_agents").insert({ ...DEFAULT_AGENT, ...details, organization_id: org.id });
      if (error) throw new Error(agent ? "Could not save agent details" : "Could not create the voice agent");
    },
    onSuccess: () => {
      toast.success(agent ? "Sarvam details saved" : "Voice agent created with these Sarvam details");
      void qc.invalidateQueries({ queryKey: ["sarvam-org", org.id] });
      void qc.invalidateQueries({ queryKey: ["call-agents", org.id] });
      void qc.invalidateQueries({ queryKey: ["voice_agents"] });
      void qc.invalidateQueries({ queryKey: ["sarvam-status", org.id] });
    },
    onError: (e) => toast.error(e.message),
  });

  const field = (id: keyof Form, label: string, disabled = false) => (
    <div className="space-y-1.5">
      <Label htmlFor={`sv-${id}`}>{label}</Label>
      <Input id={`sv-${id}`} value={f[id]} placeholder={DEFAULT_FORM[id]} disabled={disabled} maxLength={200}
        onChange={(e) => setF((p) => ({ ...p, [id]: e.target.value }))} />
    </div>
  );

  return (
    <form className="space-y-3 border-t pt-4" onSubmit={(e) => { e.preventDefault(); save.mutate(); }}>
      <h3 className="text-sm font-semibold">Sarvam setup</h3>
      <div className="grid gap-3 sm:grid-cols-2">
        {field("orgId", "Sarvam organization ID", !isAdmin)}
        {field("workspaceId", "Sarvam workspace ID", !isAdmin)}
        {field("agentId", "Agent (app) ID")}
        {field("version", "Agent version")}
        {field("connectionId", "Telephony connection ID")}
        {field("callerNumber", "Connected caller number")}
      </div>
      {!isAdmin && <p className="text-xs text-muted-foreground">Only owners and admins can change organization and workspace IDs.</p>}
      <div className="flex flex-wrap gap-2">
        <Button type="submit" variant="outline" disabled={save.isPending}>
          {save.isPending ? <Loader2 className="animate-spin" /> : <Save />} {agent ? "Save Sarvam details" : "Create agent with these details"}
        </Button>
        <Button type="button" variant="ghost" disabled={save.isPending} onClick={() => setF((p) => ({ ...DEFAULT_FORM, ...(isAdmin ? {} : { orgId: p.orgId, workspaceId: p.workspaceId }) }))}>
          <RotateCcw /> Reset to defaults
        </Button>
      </div>
    </form>
  );
}
