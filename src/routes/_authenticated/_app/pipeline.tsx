import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Plus } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { PageHeader } from "@/components/app/PageHeader";
import { canWrite, useOrg } from "@/lib/org";
import { DEAL_STAGES, inr, shortDate } from "@/lib/format";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/_app/pipeline")({
  head: () => ({
    meta: [
      { title: "Sales Pipeline — Yulabs CRM" },
      { name: "description", content: "Drag deals across stages and forecast revenue." },
      { property: "og:title", content: "Sales Pipeline — Yulabs CRM" },
      { property: "og:description", content: "Drag deals across stages and forecast revenue." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Pipeline,
});

type Deal = { id: string; title: string; value: number; stage: string; probability: number; expected_close: string | null };

function Pipeline() {
  const { org, role } = useOrg();
  const qc = useQueryClient();
  const [over, setOver] = useState<string | null>(null);
  const deals = useQuery({
    queryKey: ["deals", org.id, "pipeline"],
    queryFn: async () => {
      const { data, error } = await supabase.from("deals").select("id,title,value,stage,probability,expected_close").eq("organization_id", org.id);
      if (error) throw error;
      return data as Deal[];
    },
  });
  const move = useMutation({
    mutationFn: async ({ id, stage }: { id: string; stage: string }) => {
      const probability = stage === "won" ? 100 : stage === "lost" ? 0 : undefined;
      const { error } = await supabase.from("deals").update({ stage, ...(probability !== undefined && { probability }) }).eq("id", id);
      if (error) throw error;
    },
    onMutate: async ({ id, stage }) => {
      qc.setQueryData<Deal[]>(["deals", org.id, "pipeline"], (d) => d?.map((x) => (x.id === id ? { ...x, stage } : x)));
    },
    onError: (e) => { toast.error(e.message); qc.invalidateQueries({ queryKey: ["deals"] }); },
    onSettled: () => { qc.invalidateQueries({ queryKey: ["deals"] }); qc.invalidateQueries({ queryKey: ["stats"] }); },
  });
  const editable = canWrite(role);

  return (
    <div className="animate-rise space-y-5">
      <PageHeader title="Sales Pipeline" description={editable ? "Drag a deal to move it to another stage." : "Read-only view of your pipeline."}>
        {editable && <Button variant="hero" asChild><Link to="/deals" search={{ new: true }}><Plus /> New deal</Link></Button>}
      </PageHeader>
      <div className="flex gap-4 overflow-x-auto pb-4">
        {DEAL_STAGES.map((s) => {
          const items = (deals.data ?? []).filter((d) => d.stage === s.value);
          const total = items.reduce((a, d) => a + Number(d.value), 0);
          return (
            <div key={s.value}
              onDragOver={(e) => { if (editable) { e.preventDefault(); setOver(s.value); } }}
              onDragLeave={() => setOver(null)}
              onDrop={(e) => { setOver(null); const id = e.dataTransfer.getData("id"); if (id) move.mutate({ id, stage: s.value }); }}
              className={cn("flex w-72 shrink-0 flex-col rounded-2xl border bg-secondary/80 p-3 transition-colors", over === s.value && "border-primary bg-accent")}>
              <div className="mb-3 flex items-center justify-between px-1">
                <p className="text-sm font-bold">{s.label} <span className="ml-1 rounded-md bg-background px-1.5 text-xs text-muted-foreground">{items.length}</span></p>
                <p className="text-xs font-semibold text-muted-foreground">{inr(total)}</p>
              </div>
              <div className="flex min-h-24 flex-col gap-2">
                {deals.isLoading && <Skeleton className="h-20 rounded-xl" />}
                {items.map((d) => (
                  <div key={d.id} draggable={editable} onDragStart={(e) => e.dataTransfer.setData("id", d.id)}
                    className="cursor-grab rounded-xl border bg-card p-3 shadow-soft transition hover:shadow-float active:cursor-grabbing">
                    <p className="text-sm font-semibold">{d.title}</p>
                    <div className="mt-2 flex items-center justify-between text-xs text-muted-foreground">
                      <span className="font-semibold text-foreground">{inr(d.value)}</span>
                      <span>{d.probability}% · {shortDate(d.expected_close)}</span>
                    </div>
                  </div>
                ))}
                {!deals.isLoading && !items.length && <div className="dot-canvas grid h-20 place-items-center rounded-xl border border-dashed text-xs text-muted-foreground">No deals</div>}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
