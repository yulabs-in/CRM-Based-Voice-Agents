// Shared query for the workspace owner's Aadhaar/PAN verification (table organization_verifications, 0033).
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { isAdmin, useOrg } from "@/lib/org";

export type OwnerVerification = {
  organization_id: string;
  legal_name: string | null;
  pan_masked: string | null;
  aadhaar_last4: string | null;
  pan_document_path: string | null;
  aadhaar_front_path: string | null;
  aadhaar_back_path: string | null;
  status: "not_submitted" | "pending" | "verified" | "rejected";
  submitted_at: string | null;
  reviewed_at: string | null;
  review_note: string | null;
};

export const verificationQueryKey = (orgId: string) => ["organization_verifications", orgId] as const;

/** The workspace's verification record (owners and admins only; null when nothing is saved yet). */
export function useOwnerVerification() {
  const { org, role } = useOrg();
  return useQuery({
    queryKey: verificationQueryKey(org.id),
    enabled: isAdmin(role),
    queryFn: async () => {
      const { data, error } = await supabase.from("organization_verifications")
        .select("organization_id, legal_name, pan_masked, aadhaar_last4, pan_document_path, aadhaar_front_path, aadhaar_back_path, status, submitted_at, reviewed_at, review_note")
        .eq("organization_id", org.id).maybeSingle();
      if (error) throw error;
      return (data ?? null) as OwnerVerification | null;
    },
  });
}
