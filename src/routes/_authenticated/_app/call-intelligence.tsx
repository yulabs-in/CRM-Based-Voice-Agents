import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Brain, Loader2, Sparkles } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { PageHeader } from "@/components/app/PageHeader";
import { StatusBadge } from "@/components/app/StatusBadge";
import { canWrite, useOrg } from "@/lib/org";
import { shortDate } from "@/lib/format";
import { pageHead } from "@/lib/seo";
import { analyzeCall } from "@/lib/functions/ai.functions";
import { AnswerChips } from "@/components/app/AnswerChips";
import { CallDetailSheet } from "@/components/app/CallDetailSheet";
import { useState } from "react";

export const Route = createFileRoute("/_authenticated/_app/call-intelligence")({
  head: () => pageHead("Call Intelligence", "What customers answered, with sentiment and outcomes for every call."),
  component: Page,
});

function Page() {
  const { org, role } = useOrg();
  const qc = useQueryClient();
  const run = useServerFn(analyzeCall);
  const [openCall, setOpenCall] = useState<string | null>(null);
  const calls = useQuery({
    queryKey: ["calls", org.id, "intel"],
    queryFn: async () => {
      const { data, error } = await supabase.from("calls").select("id, phone, started_at, transcript, summary, sentiment, outcome, answers").eq("organization_id", org.id).eq("status", "completed").order("started_at", { ascending: false }).limit(300);
      if (error) throw error; return data;
    },
  });
  const analyze = useMutation({
    mutationFn: (id: string) => run({ data: { callId: id } }),
    onSuccess: () => { toast.success("Summary rebuilt from the agent's answers"); qc.invalidateQueries({ queryKey: ["calls"] }); },
    onError: (e) => toast.error(e.message),
  });
  const rows = calls.data ?? [];
  const counts = { positive: 0, neutral: 0, negative: 0 } as Record<string, number>;
  rows.forEach((r) => { if (r.sentiment) counts[r.sentiment] = (counts[r.sentiment] ?? 0) + 1; });
  return (
    <div className="animate-rise space-y-5">
      <PageHeader title="Call Intelligence" description="Your Sarvam agent captures each customer's answers; the CRM turns them into an outcome, sentiment and summary. Click a call for the full conversation." />
      <div className="grid gap-3 sm:grid-cols-3">
        {(["positive", "neutral", "negative"] as const).map((k) => (
          <div key={k} className="rounded-2xl border bg-card p-4 shadow-soft"><p className="text-xs uppercase tracking-wide text-muted-foreground">{k} calls</p><p className="mt-1 text-2xl font-bold">{counts[k] ?? 0}</p></div>
        ))}
      </div>
      {calls.isLoading ? <Skeleton className="h-40 rounded-2xl" /> : rows.length === 0 ? (
        <div className="dot-canvas rounded-2xl border border-dashed py-16 text-center">
          <span className="mx-auto grid size-12 place-items-center rounded-2xl bg-accent text-accent-foreground"><Brain /></span>
          <p className="mt-4 font-semibold">No connected calls yet</p>
          <p className="mt-1 text-sm text-muted-foreground">Connected Sarvam calls and their answers will appear here.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {rows.map((r) => (
            <div key={r.id} className="rounded-2xl border bg-card p-4 shadow-soft">
              <div className="flex flex-wrap items-center gap-2">
                <button type="button" className="font-semibold hover:text-primary" onClick={() => setOpenCall(r.id)}>{r.phone ?? "Unknown number"}</button>
                <span className="text-xs text-muted-foreground">{shortDate(r.started_at)}</span>
                <StatusBadge value={r.sentiment} />
                {r.outcome && <span className="rounded-full bg-muted px-2.5 py-0.5 text-xs font-semibold">{r.outcome}</span>}
                {canWrite(role) && (
                  <Button size="sm" variant="outline" className="ml-auto" disabled={analyze.isPending} onClick={() => analyze.mutate(r.id)}>
                    {analyze.isPending && analyze.variables === r.id ? <Loader2 className="animate-spin" /> : <Sparkles />} {r.summary ? "Rebuild" : "Summarize"}
                  </Button>
                )}
              </div>
              <div className="mt-2"><AnswerChips answers={r.answers} max={8} /></div>
              <p className="mt-2 line-clamp-2 text-xs text-muted-foreground">{r.transcript}</p>
            </div>
          ))}
        </div>
      )}
      <CallDetailSheet callId={openCall} onClose={() => setOpenCall(null)} />
    </div>
  );
}
