import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Bot, Loader2, PhoneCall, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { canWrite, useOrg } from "@/lib/org";
import { isApprovedSupportTestPhone, normalizePhoneNumber } from "@/lib/sarvam-call";
import { startSarvamSupportCall } from "@/lib/sarvam.functions";

export function SupportCallTest() {
  const { org, role } = useOrg();
  const queryClient = useQueryClient();
  const phone = "8019628820";
  const [agentId, setAgentId] = useState("");
  const [consentConfirmed, setConsentConfirmed] = useState(false);
  const [attemptId, setAttemptId] = useState<string | null>(null);
  const dial = useServerFn(startSarvamSupportCall);
  const agents = useQuery({
    queryKey: ["support-call-agents", org.id],
    queryFn: async () => {
      const { data, error } = await supabase.from("voice_agents")
        .select("id, name, purpose, status, sarvam_agent_id, sarvam_connection_id, sarvam_agent_phone_number")
        .eq("organization_id", org.id).eq("purpose", "support").eq("status", "active").order("created_at");
      if (error) throw error;
      return data;
    },
    refetchInterval: (query) => query.state.data?.length ? false : 5000,
  });
  useEffect(() => {
    if (!agentId && agents.data?.length) setAgentId(agents.data[0].id);
  }, [agentId, agents.data]);
  const hasSupportAgents = (agents.data?.length ?? 0) > 0;
  const selectedAgent = useMemo(() => agents.data?.find((agent) => agent.id === agentId), [agents.data, agentId]);
  const normalizedPhone = normalizePhoneNumber(phone);
  const ready = Boolean(selectedAgent?.sarvam_agent_id && selectedAgent.sarvam_connection_id && selectedAgent.sarvam_agent_phone_number);
  const usedTestCall = useQuery({
    queryKey: ["sarvam-test-call-used", org.id, normalizedPhone],
    enabled: Boolean(normalizedPhone),
    queryFn: async () => {
      if (!normalizedPhone) return false;
      const { data, error } = await supabase.from("calls").select("id").eq("organization_id", org.id)
        .eq("phone", normalizedPhone).eq("is_test_call", true).limit(1).maybeSingle();
      if (error) throw error;
      return Boolean(data);
    },
  });
  const call = useMutation({
    mutationFn: () => dial({ data: { organizationId: org.id, agentId, phone, consentConfirmed } }),
    onSuccess: (result) => {
      setAttemptId(result.attemptId);
      setConsentConfirmed(false);
      toast.success("Sarvam accepted the support test call");
      void queryClient.invalidateQueries({ queryKey: ["calls"] });
      void queryClient.invalidateQueries({ queryKey: ["sarvam-test-call-used", org.id] });
    },
    onError: (error) => toast.error(error.message),
  });

  return (
    <section className="space-y-4 border-y py-5" aria-labelledby="support-call-test-title">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <span className="grid size-10 shrink-0 place-items-center rounded-md bg-accent text-accent-foreground"><PhoneCall className="size-5" /></span>
          <div>
            <h2 id="support-call-test-title" className="font-semibold">One-time support call test</h2>
            <p className="mt-1 text-sm text-muted-foreground">Place a single Sarvam call, then track its transcript and result in Call History.</p>
          </div>
        </div>
        <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground"><ShieldCheck className="size-4" /> Approved number · one call total</span>
      </div>

      <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <div className="space-y-2">
          <Label htmlFor="support-test-phone">Recipient number</Label>
          <Input id="support-test-phone" inputMode="tel" autoComplete="tel" value={phone} readOnly />
          <p className="text-xs text-muted-foreground">{normalizedPhone ? `Will call ${normalizedPhone}` : "Enter a valid mobile number."}</p>
        </div>
        <div className="space-y-2">
          <Label htmlFor="support-test-agent">Support agent</Label>
          <Select value={agentId || "__none"} onValueChange={(value) => setAgentId(value === "__none" ? "" : value)}>
            <SelectTrigger id="support-test-agent"><SelectValue placeholder="Choose an active support agent" /></SelectTrigger>
            <SelectContent>
              {agents.data?.map((agent) => <SelectItem key={agent.id} value={agent.id}>{agent.name}</SelectItem>)}
            </SelectContent>
          </Select>
          {agents.isLoading ? <p className="text-xs text-muted-foreground">Loading support agents…</p> : !hasSupportAgents && <p className="text-xs text-muted-foreground">Create an active support agent to begin.</p>}
          {agents.isError && <p className="text-xs text-destructive">Could not load support agents. Refresh and try again.</p>}
        </div>
      </div>

      <div className="flex items-start gap-2 border-l-2 border-primary pl-3 text-sm text-muted-foreground">
        <Bot className="mt-0.5 size-4 shrink-0" />
        <p>The agent will identify itself as AI and say the call may be recorded and transcribed. Do not share passwords or payment details.</p>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-2">
          <Checkbox id="support-test-consent" checked={consentConfirmed} onCheckedChange={(checked) => setConsentConfirmed(checked === true)} />
          <Label htmlFor="support-test-consent" className="cursor-pointer text-sm font-normal leading-5">
            I confirm the recipient agreed to receive this one test call and recording/transcription notice.
          </Label>
        </div>
        {canWrite(role) && (
          <Button
            variant="hero"
            disabled={call.isPending || agents.isLoading || usedTestCall.isLoading || usedTestCall.data || !isApprovedSupportTestPhone(phone) || !normalizedPhone || !agentId || !ready || !consentConfirmed}
            onClick={() => call.mutate()}
          >
            {call.isPending ? <Loader2 className="animate-spin" /> : <PhoneCall />}
            {call.isPending ? "Starting call…" : "Call once"}
          </Button>
        )}
      </div>

      {selectedAgent && !ready && (
        <p className="border-t pt-3 text-sm text-warning">
          Add the Sarvam agent ID, telephony connection ID, and connected caller number before calling.
        </p>
      )}
      {usedTestCall.data && <p className="border-t pt-3 text-sm text-warning">The one allowed test call for this number has already been used.</p>}
      {attemptId && <p role="status" className="text-sm text-success">Call request accepted · {attemptId}</p>}
    </section>
  );
}