import { createFileRoute } from "@tanstack/react-router";
import { useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Copy, Trash2, UserPlus } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PageHeader } from "@/components/app/PageHeader";
import { ROLE_LABELS, isAdmin, useOrg, type OrgRole } from "@/lib/org";
import { shortDate } from "@/lib/format";
import { hierarchyRows, managerOptions } from "@/lib/sales-ops";

export const Route = createFileRoute("/_authenticated/_app/team")({
  head: () => ({
    meta: [
      { title: "Team Management — Yulabs CRM" },
      { name: "description", content: "Invite teammates and manage their roles." },
      { property: "og:title", content: "Team Management — Yulabs CRM" },
      { property: "og:description", content: "Invite teammates and manage their roles." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Team,
});

const ROLES = (Object.keys(ROLE_LABELS) as OrgRole[]);

function Team() {
  const { org, role, userId } = useOrg();
  const admin = isAdmin(role);
  const qc = useQueryClient();
  const [email, setEmail] = useState("");
  const [newRole, setNewRole] = useState<OrgRole>("sales_rep");

  const members = useQuery({
    queryKey: ["team", org.id],
    queryFn: async () => {
      const { data, error } = await supabase.from("memberships").select("id,user_id,role,reports_to,created_at").eq("organization_id", org.id);
      if (error) throw error;
      const { data: profs } = await supabase.from("profiles").select("id,full_name,email").in("id", data.map((m) => m.user_id));
      const pm = new Map((profs ?? []).map((p) => [p.id, p]));
      return hierarchyRows(data.map((m) => ({ ...m, reports_to: m.reports_to ?? null, profile: pm.get(m.user_id) })));
    },
  });
  const invites = useQuery({
    queryKey: ["invites", org.id], enabled: admin,
    queryFn: async () => {
      const { data, error } = await supabase.from("invitations").select("*").eq("organization_id", org.id).eq("status", "pending").order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });
  const refresh = () => { qc.invalidateQueries({ queryKey: ["team"] }); qc.invalidateQueries({ queryKey: ["invites"] }); };
  const invite = useMutation({
    mutationFn: async () => { const { error } = await supabase.from("invitations").insert({ organization_id: org.id, email: email.trim(), role: newRole }); if (error) throw error; },
    onSuccess: () => { toast.success("Invitation created — copy the link to share it"); setEmail(""); refresh(); },
    onError: (e) => toast.error(e.message),
  });
  const setRole = useMutation({
    mutationFn: async ({ id, r }: { id: string; r: OrgRole }) => { const { error } = await supabase.from("memberships").update({ role: r }).eq("id", id); if (error) throw error; },
    onSuccess: () => { toast.success("Role updated"); refresh(); }, onError: (e) => toast.error(e.message),
  });
  const setManager = useMutation({
    mutationFn: async ({ id, to }: { id: string; to: string | null }) => { const { error } = await supabase.from("memberships").update({ reports_to: to }).eq("id", id); if (error) throw error; },
    onSuccess: () => { toast.success("Reporting line updated"); refresh(); }, onError: (e) => toast.error(e.message),
  });
  const remove = useMutation({
    mutationFn: async ({ t, id }: { t: "memberships" | "invitations"; id: string }) => { const { error } = await supabase.from(t).delete().eq("id", id); if (error) throw error; },
    onSuccess: () => { toast.success("Removed"); refresh(); }, onError: (e) => toast.error(e.message),
  });
  const link = (t: string) => `${window.location.origin}/invite/${t}`;

  return (
    <div className="animate-rise space-y-6">
      <PageHeader title="Team Management" description="Invite teammates and control what each role can do." />
      {admin && (
        <form onSubmit={(e: FormEvent) => { e.preventDefault(); invite.mutate(); }} className="flex flex-wrap gap-2 rounded-2xl border bg-card p-4 shadow-soft">
          <Input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="teammate@company.com" className="min-w-56 flex-1 rounded-xl" />
          <Select value={newRole} onValueChange={(v) => setNewRole(v as OrgRole)}>
            <SelectTrigger className="w-56 rounded-xl"><SelectValue /></SelectTrigger>
            <SelectContent>{ROLES.filter((r) => r !== "owner").map((r) => <SelectItem key={r} value={r}>{ROLE_LABELS[r]}</SelectItem>)}</SelectContent>
          </Select>
          <Button variant="hero" disabled={invite.isPending}><UserPlus /> Invite</Button>
        </form>
      )}
      <div className="rounded-2xl border bg-card shadow-soft">
        <div className="border-b px-4 py-3">
          <p className="text-sm font-semibold">Members ({members.data?.length ?? 0})</p>
          <p className="text-xs text-muted-foreground">Sales hierarchy: set who each person reports to (Sales Manager → Team Lead → Sales Representative). Reports and dashboards roll numbers up the tree.</p>
        </div>
        <ul>
          {members.data?.map((m) => (
            <li key={m.id} className="flex flex-wrap items-center gap-3 border-b px-4 py-3 last:border-0" style={{ paddingLeft: 16 + m.depth * 24 }}>
              {m.depth > 0 && <span className="text-muted-foreground" aria-hidden>└</span>}
              <span className="grid size-9 place-items-center rounded-full bg-accent text-sm font-bold text-accent-foreground">{(m.profile?.full_name || m.profile?.email || "?").slice(0, 1).toUpperCase()}</span>
              <div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold">{m.profile?.full_name || m.profile?.email || "Member"}{m.user_id === userId && " (you)"}</p><p className="truncate text-xs text-muted-foreground">{m.profile?.email}</p></div>
              {admin ? (
                <Select value={m.reports_to ?? "__none"} onValueChange={(v) => setManager.mutate({ id: m.id, to: v === "__none" ? null : v })}>
                  <SelectTrigger className="w-48 rounded-xl" aria-label={`Who ${m.profile?.full_name || "this member"} reports to`}><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none">Reports to no one</SelectItem>
                    {managerOptions(members.data ?? [], m.user_id).map((o) => <SelectItem key={o.user_id} value={o.user_id}>Reports to {o.profile?.full_name || o.profile?.email || "member"}</SelectItem>)}
                  </SelectContent>
                </Select>
              ) : m.reports_to ? (
                <span className="text-xs text-muted-foreground">Reports to {members.data?.find((x) => x.user_id === m.reports_to)?.profile?.full_name ?? "—"}</span>
              ) : null}
              {admin && m.role !== "owner" && m.user_id !== userId ? (
                <>
                  <Select value={m.role} onValueChange={(v) => setRole.mutate({ id: m.id, r: v as OrgRole })}>
                    <SelectTrigger className="w-52 rounded-xl"><SelectValue /></SelectTrigger>
                    <SelectContent>{ROLES.filter((r) => r !== "owner").map((r) => <SelectItem key={r} value={r}>{ROLE_LABELS[r]}</SelectItem>)}</SelectContent>
                  </Select>
                  <Button variant="ghost" size="icon" aria-label="Remove" onClick={() => confirm("Remove this member?") && remove.mutate({ t: "memberships", id: m.id })}><Trash2 /></Button>
                </>
              ) : <span className="rounded-full bg-muted px-2.5 py-1 text-xs font-semibold">{ROLE_LABELS[m.role]}</span>}
            </li>
          ))}
        </ul>
      </div>
      {admin && !!invites.data?.length && (
        <div className="rounded-2xl border bg-card shadow-soft">
          <p className="border-b px-4 py-3 text-sm font-semibold">Pending invitations</p>
          <ul>
            {invites.data.map((i) => (
              <li key={i.id} className="flex flex-wrap items-center gap-3 border-b px-4 py-3 text-sm last:border-0">
                <span className="flex-1 truncate font-medium">{i.email}</span>
                <span className="text-xs text-muted-foreground">{ROLE_LABELS[i.role]} · {shortDate(i.created_at)}</span>
                <Button variant="outline" size="sm" onClick={() => { navigator.clipboard.writeText(link(i.token)); toast.success("Invite link copied"); }}><Copy /> Copy link</Button>
                <Button variant="ghost" size="icon" aria-label="Revoke" onClick={() => remove.mutate({ t: "invitations", id: i.id })}><Trash2 /></Button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
