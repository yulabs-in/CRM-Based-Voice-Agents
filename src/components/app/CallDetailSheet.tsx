import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Bot, Clock, Loader2, Phone, RefreshCw, User } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { StatusBadge } from "@/components/app/StatusBadge";
import { CallRecordingPlayer } from "@/components/app/CallRecordingPlayer";
import { supabase } from "@/integrations/supabase/client";
import { canWrite, useOrg } from "@/lib/org";
import { refreshCallRecording } from "@/lib/recordings.functions";
import { asAnswers, asTurns, humanize, type TranscriptTurn } from "@/lib/sarvam-call";
import { duration } from "@/lib/call-insights";

function parseTranscript(text: string | null): TranscriptTurn[] {
  if (!text) return [];
  return text.split("\n").map((line) => {
    const match = /^(Agent|Customer|User|Assistant):\s*(.*)$/i.exec(line.trim());
    if (!match) return { role: "customer" as const, text: line.trim() };
    return { role: /agent|assistant/i.test(match[1]!) ? "agent" as const : "customer" as const, text: match[2]! };
  }).filter((turn) => turn.text);
}

/** Everything about one call: what the customer answered, the conversation, and the recording. */
export function CallDetailSheet({ callId, onClose }: { callId: string | null; onClose: () => void }) {
  const { org, role } = useOrg();
  const qc = useQueryClient();
  const refresh = useServerFn(refreshCallRecording);
  const call = useQuery({
    queryKey: ["calls", org.id, "detail", callId],
    enabled: !!callId,
    queryFn: async () => {
      const { data, error } = await supabase.from("calls")
        .select("*, contact:contacts(first_name, last_name, email), agent:voice_agents(name), campaign:call_campaigns(name)")
        .eq("id", callId!).maybeSingle();
      if (error) throw error;
      return data;
    },
  });
  const fetchRecording = useMutation({
    mutationFn: () => refresh({ data: { callId: callId! } }),
    onSuccess: (result) => {
      if (result.recording) toast.success("Recording saved");
      else toast.message(result.reason ?? "No recording yet");
      void qc.invalidateQueries({ queryKey: ["calls"] });
    },
    onError: (error) => toast.error(error.message),
  });

  const data = call.data;
  const answers = Object.entries(asAnswers(data?.answers));
  const turns = data ? (asTurns(data.transcript_turns).length ? asTurns(data.transcript_turns) : parseTranscript(data.transcript)) : [];
  const contactName = data?.contact ? `${data.contact.first_name ?? ""} ${data.contact.last_name ?? ""}`.trim() : null;

  return (
    <Sheet open={!!callId} onOpenChange={(open) => !open && onClose()}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-xl">
        <SheetHeader>
          <SheetTitle>{contactName || data?.phone || "Call"}</SheetTitle>
          <SheetDescription>
            {data ? `${data.phone ?? ""}${data.campaign?.name ? ` · ${data.campaign.name}` : ""}${data.agent?.name ? ` · ${data.agent.name}` : ""}` : "Loading call…"}
          </SheetDescription>
        </SheetHeader>

        {call.isLoading || !data ? <div className="mt-6 space-y-3"><Skeleton className="h-20" /><Skeleton className="h-40" /></div> : (
          <div className="mt-5 space-y-6">
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <StatusBadge value={data.status} />
              {data.sentiment && <StatusBadge value={data.sentiment} />}
              <span className="inline-flex items-center gap-1 text-muted-foreground"><Clock className="size-3.5" /> {duration(Number(data.duration_seconds ?? 0))}</span>
              <span className="text-muted-foreground">{data.started_at ? new Date(data.started_at).toLocaleString("en-IN") : ""}</span>
              {data.retry_attempt > 0 && <span className="text-muted-foreground">· retry #{data.retry_attempt}</span>}
            </div>
            {data.sarvam_failure_reason && <p className="rounded-xl bg-danger-soft p-3 text-sm text-destructive">{data.sarvam_failure_reason}</p>}

            <section>
              <h3 className="mb-2 text-sm font-semibold">What the customer said</h3>
              {answers.length ? (
                <dl className="divide-y rounded-xl border">
                  {answers.map(([key, value]) => (
                    <div key={key} className="grid grid-cols-[minmax(0,2fr)_minmax(0,3fr)] gap-3 px-3 py-2 text-sm">
                      <dt className="text-muted-foreground">{humanize(key)}</dt><dd className="break-words font-medium">{value}</dd>
                    </div>
                  ))}
                </dl>
              ) : <p className="text-sm text-muted-foreground">No answers captured. Add output variables to the Sarvam agent to record answers.</p>}
              {data.outcome && <p className="mt-2 text-sm"><span className="text-muted-foreground">Outcome:</span> <span className="font-semibold">{data.outcome}</span></p>}
            </section>

            <section>
              <div className="mb-2 flex items-center gap-2">
                <h3 className="text-sm font-semibold">Recording</h3>
                {canWrite(role) && data.sarvam_interaction_id && (
                  <Button size="sm" variant="ghost" className="ml-auto" disabled={fetchRecording.isPending} onClick={() => fetchRecording.mutate()}>
                    {fetchRecording.isPending ? <Loader2 className="animate-spin" /> : <RefreshCw />} {data.recording_path ? "Refresh from Sarvam" : "Fetch recording"}
                  </Button>
                )}
              </div>
              {data.recording_path ? <CallRecordingPlayer key={data.recording_path} callId={data.id} autoLoad /> : <p className="text-sm text-muted-foreground">{data.sarvam_interaction_id ? "Not saved yet — Sarvam can take a minute after the call ends." : "No recording for this call."}</p>}
            </section>

            <section>
              <h3 className="mb-2 text-sm font-semibold">Conversation</h3>
              {turns.length ? (
                <ol className="space-y-2">
                  {turns.map((turn, index) => (
                    <li key={index} className={turn.role === "agent" ? "flex gap-2" : "flex flex-row-reverse gap-2"}>
                      <span className="mt-1 grid size-6 shrink-0 place-items-center rounded-full bg-muted">{turn.role === "agent" ? <Bot className="size-3.5" /> : <User className="size-3.5" />}</span>
                      <p className={turn.role === "agent" ? "max-w-[85%] rounded-2xl rounded-tl-sm bg-muted px-3 py-2 text-sm" : "max-w-[85%] rounded-2xl rounded-tr-sm bg-primary px-3 py-2 text-sm text-primary-foreground"}>{turn.text}</p>
                    </li>
                  ))}
                </ol>
              ) : <p className="text-sm text-muted-foreground">No transcript.</p>}
            </section>

            {data.summary && <section><h3 className="mb-1 text-sm font-semibold">Summary</h3><p className="text-sm text-muted-foreground">{data.summary}</p></section>}
            <p className="flex items-center gap-1 text-xs text-muted-foreground"><Phone className="size-3" /> {data.direction} · Sarvam attempt {data.external_id ?? "—"}</p>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
