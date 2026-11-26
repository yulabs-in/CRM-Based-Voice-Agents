// Reminds the workspace owner to submit Aadhaar and PAN until the verification is submitted.
import { Link } from "@tanstack/react-router";
import { ShieldAlert } from "lucide-react";
import { useOrg } from "@/lib/org";
import { useOwnerVerification } from "@/lib/owner-verification";

export function OwnerVerificationBanner() {
  const { role } = useOrg();
  const verification = useOwnerVerification();
  if (role !== "owner" || verification.isLoading || verification.isError) return null;
  const status = verification.data?.status ?? "not_submitted";
  if (status !== "not_submitted" && status !== "rejected") return null;

  return (
    <div role="status" className="mb-4 flex flex-wrap items-center gap-3 rounded-2xl border border-amber-300/60 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200">
      <ShieldAlert className="size-5 shrink-0" />
      <p className="flex-1">
        {status === "rejected"
          ? "Your workspace verification needs changes. Please check the note and submit again."
          : "Verify your workspace: as the owner, please submit your Aadhaar and PAN for verification."}
      </p>
      <Link to="/verification" className="font-semibold underline underline-offset-2">Verify now</Link>
    </div>
  );
}
