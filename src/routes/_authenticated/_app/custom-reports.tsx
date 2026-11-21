import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Download } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PageHeader } from "@/components/app/PageHeader";
import { useOrg } from "@/lib/org";
import { downloadCsv } from "@/lib/csv";
import { pageHead } from "@/lib/seo";

export const Route = createFileRoute("/_authenticated/_app/custom-reports")({
  head: () => pageHead("Custom Reports", "Group any record type by any field and export it."),
  component: Page,
});

const SOURCES = {
  leads: ["status", "source"], deals: ["stage"], tasks: ["status", "priority"], calls: ["status", "direction", "sentiment", "outcome"],
  messages: ["channel", "status", "direction"], meetings: ["status"], call_campaigns: ["status"],
} as const;
type Src = keyof typeof SOURCES;

function Page() {
  const { org } = useOrg();
  const [src, setSrc] = useState<Src>("leads");
  const [by, setBy] = useState<string>("status");
  const q = useQuery({
    queryKey: ["report", org.id, src, by],
    queryFn: async () => {
      const { data, error } = await supabase.from(src).select(by).eq("organization_id", org.id).limit(10000);
      if (error) throw error;
      const m = new Map<string, number>();
      (data as unknown as Record<string, unknown>[]).forEach((r) => { const k = String(r[by] ?? "None"); m.set(k, (m.get(k) ?? 0) + 1); });
      return [...m.entries()].map(([group, count]) => ({ group, count })).sort((a, b) => b.count - a.count);
    },
  });
  const rows = q.data ?? [];
  const total = rows.reduce((s, r) => s + r.count, 0);
  return (
    <div className="animate-rise space-y-5">
      <PageHeader title="Custom Reports" description="Pick what to count and how to group it.">
        <Button variant="outline" disabled={!rows.length} onClick={() => downloadCsv(`${src}-by-${by}.csv`, rows)}><Download /> Export</Button>
      </PageHeader>
      <div className="flex flex-wrap gap-4 rounded-2xl border bg-card p-4 shadow-soft">
        <div className="space-y-1.5"><Label>Records</Label>
          <Select value={src} onValueChange={(v) => { setSrc(v as Src); setBy(SOURCES[v as Src][0]); }}>
            <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
            <SelectContent>{Object.keys(SOURCES).map((k) => <SelectItem key={k} value={k} className="capitalize">{k.replace(/_/g, " ")}</SelectItem>)}</SelectContent>
          </Select></div>
        <div className="space-y-1.5"><Label>Group by</Label>
          <Select value={by} onValueChange={setBy}>
            <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
            <SelectContent>{SOURCES[src].map((k) => <SelectItem key={k} value={k} className="capitalize">{k}</SelectItem>)}</SelectContent>
          </Select></div>
      </div>
      <div className="rounded-2xl border bg-card shadow-soft">
        <table className="w-full text-sm">
          <thead><tr className="border-b text-left text-xs uppercase text-muted-foreground"><th className="px-4 py-2.5">{by}</th><th className="px-4 py-2.5">Count</th><th className="px-4 py-2.5">Share</th></tr></thead>
          <tbody>
            {rows.length === 0 ? <tr><td colSpan={3} className="py-10 text-center text-muted-foreground">{q.isLoading ? "Loading…" : "No records yet"}</td></tr> : rows.map((r) => (
              <tr key={r.group} className="border-b last:border-0"><td className="px-4 py-3 font-medium capitalize">{r.group.replace(/_/g, " ")}</td><td className="px-4 py-3">{r.count}</td><td className="px-4 py-3">{Math.round((r.count / total) * 100)}%</td></tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
