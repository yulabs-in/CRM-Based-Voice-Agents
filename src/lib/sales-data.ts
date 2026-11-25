// Shared queries for the sales pages (orders, payments, KYC, renewals, reports) and the team hierarchy.
// Query keys start with the table name so RealtimeSync and EntityPage invalidations refresh them.
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useOrg, type OrgRole } from "@/lib/org";
import { fetchAll } from "@/lib/fetch-all";

export type SalesOrder = {
  id: string; order_number: string; contact_id: string | null; deal_id: string | null; call_id: string | null; owner_id: string | null;
  product_type: string; plan_name: string | null; insurer: string | null; premium_amount: number; sum_insured: number | null;
  payment_frequency: string; payment_due_date: string | null; amount_paid: number; status: string; policy_number: string | null;
  policy_start_date: string | null; policy_end_date: string | null; renewed_from_order_id: string | null; source: string;
  notes: string | null; created_at: string; updated_at: string;
};
export type Payment = {
  id: string; sales_order_id: string; amount: number; paid_on: string; mode: string; reference: string | null;
  status: string; notes: string | null; recorded_by: string | null; created_at: string;
};
export type Kyc = {
  id: string; contact_id: string; full_name: string | null; date_of_birth: string | null; email: string | null; address_line: string | null;
  city: string | null; state: string | null; pincode: string | null; nominee_name: string | null; nominee_relation: string | null;
  pan_masked: string | null; consent_given: boolean; status: string; source: string; call_id: string | null; verified_at: string | null; updated_at: string;
};
export type Member = { id: string; user_id: string; role: OrgRole; reports_to: string | null; name: string; email: string | null };
export type ContactLite = { id: string; name: string; phone: string | null; custom_fields: Record<string, unknown> | null };

const ORDER_COLS = "id, order_number, contact_id, deal_id, call_id, owner_id, product_type, plan_name, insurer, premium_amount, sum_insured, payment_frequency, payment_due_date, amount_paid, status, policy_number, policy_start_date, policy_end_date, renewed_from_order_id, source, notes, created_at, updated_at";

export function useSalesOrders() {
  const { org } = useOrg();
  return useQuery({
    queryKey: ["sales_orders", org.id, "all"],
    queryFn: () => fetchAll<SalesOrder>((from, to) => supabase.from("sales_orders").select(ORDER_COLS).eq("organization_id", org.id)
      .order("created_at", { ascending: false }).range(from, to) as never),
  });
}

export function usePayments() {
  const { org } = useOrg();
  return useQuery({
    queryKey: ["payments", org.id],
    queryFn: () => fetchAll<Payment>((from, to) => supabase.from("payments").select("id, sales_order_id, amount, paid_on, mode, reference, status, notes, recorded_by, created_at")
      .eq("organization_id", org.id).order("paid_on", { ascending: false }).range(from, to) as never),
  });
}

export function useKyc() {
  const { org } = useOrg();
  return useQuery({
    queryKey: ["client_kyc", org.id, "all"],
    queryFn: () => fetchAll<Kyc>((from, to) => supabase.from("client_kyc").select("id, contact_id, full_name, date_of_birth, email, address_line, city, state, pincode, nominee_name, nominee_relation, pan_masked, consent_given, status, source, call_id, verified_at, updated_at")
      .eq("organization_id", org.id).range(from, to) as never),
  });
}

/** Contacts referenced by the given ids (name + phone), for labels and renewal calls. */
export function useContactsById(ids: (string | null)[]) {
  const { org } = useOrg();
  const unique = [...new Set(ids.filter((id): id is string => !!id))].sort();
  return useQuery({
    queryKey: ["contacts", org.id, "by-id", unique.join(",")],
    enabled: unique.length > 0,
    queryFn: async () => {
      const out = new Map<string, ContactLite>();
      for (let i = 0; i < unique.length; i += 200) {
        const { data, error } = await supabase.from("contacts").select("id, first_name, last_name, phone, custom_fields").eq("organization_id", org.id).in("id", unique.slice(i, i + 200));
        if (error) throw error;
        for (const c of data ?? []) {
          out.set(c.id, { id: c.id, name: `${c.first_name ?? ""} ${c.last_name ?? ""}`.trim() || c.phone || "Client", phone: c.phone, custom_fields: (c.custom_fields ?? null) as Record<string, unknown> | null });
        }
      }
      return out;
    },
  });
}

/** Workspace members with names and reporting lines. */
export function useMembers() {
  const { org } = useOrg();
  return useQuery({
    queryKey: ["team", org.id, "hierarchy"],
    queryFn: async () => {
      const { data, error } = await supabase.from("memberships").select("id, user_id, role, reports_to").eq("organization_id", org.id);
      if (error) throw error;
      const { data: profiles } = await supabase.from("profiles").select("id, full_name, email").in("id", data.map((m) => m.user_id));
      const byId = new Map((profiles ?? []).map((p) => [p.id, p]));
      return data.map((m): Member => {
        const p = byId.get(m.user_id);
        return { id: m.id, user_id: m.user_id, role: m.role, reports_to: m.reports_to ?? null, name: p?.full_name || p?.email || "Teammate", email: p?.email ?? null };
      });
    },
  });
}

/** Roles that work on orders, payments and KYC (matches the RLS policies in 0021). */
export const SALES_ROLES: OrgRole[] = ["owner", "admin", "sales_manager", "team_lead", "sales_rep"];
export const isSalesRole = (role?: OrgRole) => !!role && SALES_ROLES.includes(role);

/** Stable empty list, so `members.data ?? NO_MEMBERS` doesn't change identity on every render. */
export const NO_MEMBERS: Member[] = [];
