import { useQuery } from "@tanstack/react-query";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { supabase } from "@/integrations/supabase/client";
import { Skeleton } from "@/components/ui/skeleton";
import { PageHeader } from "./PageHeader";
import { useOrg } from "@/lib/org";
import { inr } from "@/lib/format";
import { buildAnalytics, type AnalyticsKind } from "@/lib/analytics";

export function AnalyticsPage({ kind, title, description }: { kind: AnalyticsKind; title: string; description: string }) {
  const { org } = useOrg();
  const q = useQuery({
    queryKey: ["analytics", org.id],
    queryFn: async () => {
      const o = org.id;
      const [deals, leads, calls, camps, tasks, members, profiles] = await Promise.all([
        supabase.from("deals").select("id,stage,value,owner_id,created_at").eq("organization_id", o).limit(5000),
        supabase.from("leads").select("id,status,source,created_at").eq("organization_id", o).limit(5000),
        supabase.from("calls").select("id,status,duration_seconds,sentiment,campaign_id,agent_id,started_at").eq("organization_id", o).limit(5000),
        supabase.from("call_campaigns").select("id,name").eq("organization_id", o),
        supabase.from("tasks").select("id,status,assignee_id").eq("organization_id", o).limit(5000),
        supabase.from("memberships").select("user_id").eq("organization_id", o),
        supabase.from("profiles").select("id,full_name"),
      ]);
      return { deals: deals.data ?? [], leads: leads.data ?? [], calls: calls.data ?? [], campaigns: camps.data ?? [], tasks: tasks.data ?? [], members: members.data ?? [], profiles: profiles.data ?? [] };
    },
  });
  const a = q.data ? buildAnalytics(kind, q.data as never) : null;
  return (
    <div className="animate-rise space-y-5">
      <PageHeader title={title} description={description} />
      {!a ? <Skeleton className="h-72 rounded-2xl" /> : (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {a.kpis.map((k) => (
              <div key={k.label} className="rounded-2xl border bg-card p-4 shadow-soft">
                <p className="text-xs uppercase tracking-wide text-muted-foreground">{k.label}</p>
                <p className="mt-1 text-2xl font-bold">{k.money ? inr(k.value) : k.value}</p>
              </div>
            ))}
          </div>
          {a.charts.map((c) => (
            <div key={c.title} className="rounded-2xl border bg-card p-5 shadow-soft">
              <p className="mb-3 font-semibold">{c.title}</p>
              {c.data.length === 0 ? <p className="py-10 text-center text-sm text-muted-foreground">No data yet</p> : (
                <ResponsiveContainer width="100%" height={260}>
                  <BarChart data={c.data}><CartesianGrid strokeDasharray="3 3" stroke="var(--border)" /><XAxis dataKey="name" fontSize={12} /><YAxis fontSize={12} /><Tooltip /><Bar dataKey="value" fill="var(--chart-1)" radius={[6, 6, 0, 0]} /></BarChart>
                </ResponsiveContainer>
              )}
            </div>
          ))}
        </>
      )}
    </div>
  );
}
