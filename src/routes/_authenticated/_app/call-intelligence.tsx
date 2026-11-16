import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Brain, Loader2, Sparkles } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { PageHeader } from "@/components/app/PageHeader";
import { StatusBadge } from "@/components/app/StatusBadge";
import { canWrite, useOrg } from "@/lib/org";
import { shortDate } from "@/lib/format";
import { pageHead } from "@/lib/seo";
import { analyzeCall } from "@/server/ai.functions";

export const Route = createFileRoute("/_authenticated/_app/call-intelligence")({
  head: () => pageHead("Call Intelligence", "AI summaries, sentiment and outcomes for every call."),
  component: Page,
});

function Page() {
  const { org, role } = useOrg();
  const qc = useQueryClient();
  const run = useServerFn(analyzeCall);
  const calls = useQuery({
    queryKey: ["calls", org.id, "intel"],
    queryFn: async () => {
      const { data, error } = await supabase.from("calls").select("id, phone, started_at, transcript, summary, sentiment, outcome").eq("organization_id", org.id).not("transcript", "is", null).order("started_at", { ascending: false }).limit(200);
      if (error) throw error; return data;
    },
  });
  const analyze = useMutation({
    mutationFn: (id: string) => run({ data: { callId: id } }),
    onSuccess: () => { toast.success("Call analyzed"); qc.invalidateQueries({ queryKey: ["calls"] }); },
    onError: (e) => toast.error(e.message),
  });
  const rows = calls.data ?? [];
  const counts = { positive: 0, neutral: 0, negative: 0 } as Record<string, number>;
  rows.forEach((r) => { if (r.sentiment) counts[r.sentiment] = (counts[r.sentiment] ?? 0) + 1; });
  return (
    <div className="animate-rise space-y-5">
      <PageHeader title="Call Intelligence" description="AI reads each transcript and gives you a summary, the customer's mood and the outcome." />
      <div className="grid gap-3 sm:grid-cols-3">
        {(["positive", "neutral", "negative"] as const).map((k) => (
          <div key={k} className="rounded-2xl border bg-card p-4 shadow-soft"><p className="text-xs uppercase tracking-wide text-muted-foreground">{k} calls</p><p className="mt-1 text-2xl font-bold">{counts[k] ?? 0}</p></div>
        ))}
      </div>
      {calls.isLoading ? <Skeleton className="h-40 rounded-2xl" /> : rows.length === 0 ? (
        <div className="dot-canvas rounded-2xl border border-dashed py-16 text-center">
          <span className="mx-auto grid size-12 place-items-center rounded-2xl bg-accent text-accent-foreground"><Brain /></span>
          <p className="mt-4 font-semibold">No transcripts yet</p>
          <p className="mt-1 text-sm text-muted-foreground">Calls with transcripts from Sarvam (or added in Call History) will appear here.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {rows.map((r) => (
            <div key={r.id} className="rounded-2xl border bg-card p-4 shadow-soft">
              <div className="flex flex-wrap items-center gap-2">
                <p className="font-semibold">{r.phone ?? "Unknown number"}</p>
                <span className="text-xs text-muted-foreground">{shortDate(r.started_at)}</span>
                <StatusBadge value={r.sentiment} />
                {r.outcome && <span className="rounded-full bg-muted px-2.5 py-0.5 text-xs font-semibold">{r.outcome}</span>}
                {canWrite(role) && (
                  <Button size="sm" variant="outline" className="ml-auto" disabled={analyze.isPending} onClick={() => analyze.mutate(r.id)}>
                    {analyze.isPending && analyze.variables === r.id ? <Loader2 className="animate-spin" /> : <Sparkles />} {r.summary ? "Re-analyze" : "Analyze"}
                  </Button>
                )}
              </div>
              <p className="mt-2 text-sm">{r.summary ?? <span className="text-muted-foreground">Not analyzed yet.</span>}</p>
              <p className="mt-2 line-clamp-2 text-xs text-muted-foreground">{r.transcript}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
