import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { CalendarDays, CheckSquare, Handshake, History, Mail, PhoneCall, UserPlus, type LucideIcon } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { Skeleton } from "@/components/ui/skeleton";
import { PageHeader } from "@/components/app/PageHeader";
import { useOrg } from "@/lib/org";
import { pageHead } from "@/lib/seo";

export const Route = createFileRoute("/_authenticated/_app/activity-timeline")({
  head: () => pageHead("Activity Timeline", "Everything that happened across your CRM, newest first."),
  component: Page,
});

type Item = { id: string; at: string; icon: LucideIcon; text: string };

function Page() {
  const { org } = useOrg();
  const q = useQuery({
    queryKey: ["timeline", org.id],
    queryFn: async () => {
      const o = org.id;
      const [l, d, t, c, m, mt] = await Promise.all([
        supabase.from("leads").select("id,name,created_at").eq("organization_id", o).order("created_at", { ascending: false }).limit(30),
        supabase.from("deals").select("id,title,stage,updated_at").eq("organization_id", o).order("updated_at", { ascending: false }).limit(30),
        supabase.from("tasks").select("id,title,status,created_at").eq("organization_id", o).order("created_at", { ascending: false }).limit(30),
        supabase.from("calls").select("id,phone,status,started_at").eq("organization_id", o).order("started_at", { ascending: false }).limit(30),
        supabase.from("messages").select("id,channel,recipient,created_at").eq("organization_id", o).order("created_at", { ascending: false }).limit(30),
        supabase.from("meetings").select("id,title,created_at").eq("organization_id", o).order("created_at", { ascending: false }).limit(30),
      ]);
      const items: Item[] = [
        ...(l.data ?? []).map((r) => ({ id: "l" + r.id, at: r.created_at, icon: UserPlus, text: `New lead: ${r.name}` })),
        ...(d.data ?? []).map((r) => ({ id: "d" + r.id, at: r.updated_at, icon: Handshake, text: `Deal "${r.title}" is in ${r.stage}` })),
        ...(t.data ?? []).map((r) => ({ id: "t" + r.id, at: r.created_at, icon: CheckSquare, text: `Task: ${r.title} (${r.status.replace(/_/g, " ")})` })),
        ...(c.data ?? []).map((r) => ({ id: "c" + r.id, at: r.started_at ?? "", icon: PhoneCall, text: `Call with ${r.phone ?? "unknown"} — ${r.status.replace(/_/g, " ")}` })),
        ...(m.data ?? []).map((r) => ({ id: "m" + r.id, at: r.created_at, icon: Mail, text: `${r.channel} message with ${r.recipient ?? "contact"}` })),
        ...(mt.data ?? []).map((r) => ({ id: "x" + r.id, at: r.created_at, icon: CalendarDays, text: `Meeting booked: ${r.title}` })),
      ];
      return items.filter((i) => i.at).sort((a, b) => b.at.localeCompare(a.at)).slice(0, 100);
    },
  });
  return (
    <div className="animate-rise space-y-5">
      <PageHeader title="Activity Timeline" description="Leads, deals, tasks, calls, messages and meetings in one feed." />
      <div className="rounded-2xl border bg-card p-5 shadow-soft">
        {q.isLoading ? <Skeleton className="h-40" /> : !q.data?.length ? (
          <div className="py-12 text-center"><History className="mx-auto text-muted-foreground" /><p className="mt-3 font-semibold">No activity yet</p></div>
        ) : (
          <ol className="relative space-y-4 border-l pl-6">
            {q.data.map((i) => (
              <li key={i.id} className="relative">
                <span className="absolute -left-[37px] grid size-7 place-items-center rounded-full border bg-background text-primary"><i.icon className="size-3.5" /></span>
                <p className="text-sm font-medium">{i.text}</p>
                <p className="text-xs text-muted-foreground">{new Date(i.at).toLocaleString("en-IN")}</p>
              </li>
            ))}
          </ol>
        )}
      </div>
    </div>
  );
}
