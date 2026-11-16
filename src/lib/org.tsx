import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";

export type OrgRole = Database["public"]["Enums"]["org_role"];
export type Org = Database["public"]["Tables"]["organizations"]["Row"];
export type Membership = { role: OrgRole; organization: Org };

export const ROLE_LABELS: Record<OrgRole, string> = {
  owner: "Organization Owner",
  admin: "Organization Admin",
  sales_manager: "Sales Manager",
  sales_rep: "Sales Representative",
  voice_manager: "Voice Agent Manager",
  support_agent: "Support Agent",
  analyst: "Analyst",
  read_only: "Read-only User",
};

export const canWrite = (r?: OrgRole) => !!r && r !== "read_only" && r !== "analyst";
export const canDelete = (r?: OrgRole) => r === "owner" || r === "admin" || r === "sales_manager";
export const isAdmin = (r?: OrgRole) => r === "owner" || r === "admin";

export const membershipsQuery = {
  queryKey: ["memberships"],
  queryFn: async (): Promise<Membership[]> => {
    const { data: u } = await supabase.auth.getUser();
    if (!u.user) return [];
    const { data, error } = await supabase
      .from("memberships")
      .select("role, organization:organizations(*)")
      .eq("user_id", u.user.id);
    if (error) throw error;
    return (data ?? []).filter((m) => m.organization) as Membership[];
  },
};

type Ctx = { org: Org; role: OrgRole; memberships: Membership[]; switchOrg: (id: string) => void; userId: string; email: string };
const OrgContext = createContext<Ctx | null>(null);
const KEY = "yulabs.org";

export function OrgProvider({ memberships, userId, email, children }: { memberships: Membership[]; userId: string; email: string; children: ReactNode }) {
  const [id, setId] = useState<string>(memberships[0].organization.id);
  useEffect(() => {
    const saved = localStorage.getItem(KEY);
    if (saved && memberships.some((m) => m.organization.id === saved)) setId(saved);
  }, [memberships]);
  const current = memberships.find((m) => m.organization.id === id) ?? memberships[0];
  return (
    <OrgContext.Provider
      value={{
        org: current.organization,
        role: current.role,
        memberships,
        userId,
        email,
        switchOrg: (n) => { localStorage.setItem(KEY, n); setId(n); },
      }}
    >
      {children}
    </OrgContext.Provider>
  );
}

export function useOrg() {
  const c = useContext(OrgContext);
  if (!c) throw new Error("useOrg outside OrgProvider");
  return c;
}

export function useMemberships() {
  return useQuery(membershipsQuery);
}
