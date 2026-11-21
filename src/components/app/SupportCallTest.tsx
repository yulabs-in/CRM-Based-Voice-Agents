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
import { supabase } from "@/lib/supabase";
import { canWrite, useOrg } from "@/lib/org";
import { normalizePhoneNumber } from "@/lib/sarvam-call";
import { startSarvamCall } from "@/lib/sarvam.functions";
import { SarvamSetupForm } from "@/components/app/SarvamSetupForm";

/** Place a single Sarvam call to any number — use it to try an agent before launching a project campaign. */
export function SupportCallTest() {
  const { org, role } = useOrg();
  const queryClient = useQueryClient();
  const [phone, setPhone] = useState("");
  const [customerName, setCustomerName] = useState("");
  const [agentId, setAgentId] = useState("");
  const [consentConfirmed, setConsentConfirmed] = useState(false);
  const [attemptId, setAttemptId] = useState<string | null>(null);
  const dial = useServerFn(startSarvamCall);
  const agents = useQuery({
    queryKey: ["call-agents", org.id],
    queryFn: async () => {
      const { data, error } = await supabase.from("voice_agents")
        .select("id, name, purpose, status, sarvam_agent_id, sarvam_app_version, sarvam_connection_id, sarvam_agent_phone_number")
        .eq("organization_id", org.id).eq("status", "active").order("created_at");
      if (error) throw error;
      return data;
    },
  });
  useEffect(() => {
    if (!agentId && agents.data?.length) setAgentId(agents.data[0]!.id);
  }, [agentId, agents.data]);
  const selectedAgent = useMemo(() => agents.data?.find((agent) => agent.id === agentId), [agents.data, agentId]);
  const normalizedPhone = phone ? normalizePhoneNumber(phone) : null;
  const ready = Boolean(selectedAgent?.sarvam_agent_id && selectedAgent.sarvam_connection_id && selectedAgent.sarvam_agent_phone_number);
  const call = useMutation({
    mutationFn: () => dial({ data: { organizationId: org.id, agentId, phone, consentConfirmed: true, customerName: customerName || undefined, isTest: true } }),
    onSuccess: (result) => {
      setAttemptId(result.attemptId);
      setConsentConfirmed(false);
      // No pop-ups on success: the call appears in Live Calls / Call History on its own. Errors still show.
      void queryClient.invalidateQueries({ queryKey: ["calls"] });
      void queryClient.invalidateQueries({ queryKey: ["live"] });
    },
    onError: (error) => toast.error(error.message),
  });

  return (
    <section className="space-y-4 border-y py-5" aria-labelledby="test-call-title">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <span className="grid size-10 shrink-0 place-items-center rounded-md bg-accent text-accent-foreground"><PhoneCall className="size-5" /></span>
          <div>
            <h2 id="test-call-title" className="font-semibold">Test call</h2>
            <p className="mt-1 text-sm text-muted-foreground">Call one number with an agent before running it on a whole project. The answers, transcript and recording land in Call History.</p>
          </div>
        </div>
        <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground"><ShieldCheck className="size-4" /> Consent required</span>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <div className="space-y-2">
          <Label htmlFor="test-call-phone">Recipient number</Label>
          <Input id="test-call-phone" inputMode="tel" autoComplete="tel" placeholder="98765 43210" value={phone} onChange={(event) => setPhone(event.target.value)} />
          <p className="text-xs text-muted-foreground">{!phone ? "Indian numbers get +91 automatically." : normalizedPhone ? `Will call ${normalizedPhone}` : "Enter a valid mobile number."}</p>
        </div>
        <div className="space-y-2">
          <Label htmlFor="test-call-name">Customer name (optional)</Label>
          <Input id="test-call-name" value={customerName} maxLength={120} onChange={(event) => setCustomerName(event.target.value)} placeholder="Passed to the agent as customer_name" />
        </div>
        <div className="space-y-2">
          <Label htmlFor="test-call-agent">Voice agent</Label>
          <Select value={agentId || "__none"} onValueChange={(value) => setAgentId(value === "__none" ? "" : value)}>
            <SelectTrigger id="test-call-agent"><SelectValue placeholder="Choose an active agent" /></SelectTrigger>
            <SelectContent>
              {agents.data?.map((agent) => <SelectItem key={agent.id} value={agent.id}>{agent.name}</SelectItem>)}
            </SelectContent>
          </Select>
          {agents.isLoading ? <p className="text-xs text-muted-foreground">Loading agents…</p> : !agents.data?.length && <p className="text-xs text-muted-foreground">Create an active voice agent above to begin.</p>}
          {agents.isError && <p className="text-xs text-destructive">Could not load voice agents. Refresh and try again.</p>}
        </div>
      </div>

      <div className="flex items-start gap-2 border-l-2 border-primary pl-3 text-sm text-muted-foreground">
        <Bot className="mt-0.5 size-4 shrink-0" />
        <p>The agent should identify itself as AI and say the call may be recorded and transcribed.</p>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-2">
          <Checkbox id="test-call-consent" checked={consentConfirmed} onCheckedChange={(checked) => setConsentConfirmed(checked === true)} />
          <Label htmlFor="test-call-consent" className="cursor-pointer text-sm font-normal leading-5">
            I confirm the recipient agreed to receive this call and the recording/transcription notice.
          </Label>
        </div>
        {canWrite(role) && (
          <Button variant="hero" disabled={call.isPending || !normalizedPhone || !agentId || !ready || !consentConfirmed} onClick={() => call.mutate()}>
            {call.isPending ? <Loader2 className="animate-spin" /> : <PhoneCall />}
            {call.isPending ? "Starting call…" : "Call now"}
          </Button>
        )}
      </div>

      {selectedAgent && !ready && (
        <p className="border-t pt-3 text-sm text-warning">Add the Sarvam agent ID, telephony connection ID, and connected caller number below before calling.</p>
      )}
      {canWrite(role) && <SarvamSetupForm agent={selectedAgent} />}
      {attemptId && <p role="status" className="text-sm text-success">Call placed — follow it in Live Calls</p>}
    </section>
  );
}
