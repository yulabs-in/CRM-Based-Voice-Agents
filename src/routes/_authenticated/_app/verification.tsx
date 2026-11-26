import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { BadgeCheck, Eye, Loader2, Lock, ShieldCheck } from "lucide-react";
import { PageHeader } from "@/components/app/PageHeader";
import { StatusBadge } from "@/components/app/StatusBadge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/lib/supabase";
import { isAdmin, useOrg } from "@/lib/org";
import { pageHead } from "@/lib/seo";
import { shortDate } from "@/lib/format";
import { useOwnerVerification, verificationQueryKey } from "@/lib/owner-verification";
import {
  DOCUMENT_ACCEPT, KYC_BUCKET, VERIFICATION_STATUS_LABELS, aadhaarLast4, isValidAadhaar, isValidPan, maskedPan,
  ownerDocumentPath, validateDocumentFile,
} from "@/lib/kyc-documents";

export const Route = createFileRoute("/_authenticated/_app/verification")({
  head: () => pageHead("Workspace verification", "Owner identity verification with Aadhaar and PAN."),
  component: VerificationPage,
});

type DocKey = "pan_document_path" | "aadhaar_front_path" | "aadhaar_back_path";
const DOCS: { key: DocKey; label: string; required: boolean }[] = [
  { key: "pan_document_path", label: "PAN card", required: true },
  { key: "aadhaar_front_path", label: "Aadhaar (front)", required: true },
  { key: "aadhaar_back_path", label: "Aadhaar (back)", required: false },
];

function VerificationPage() {
  const { org, role } = useOrg();
  const qc = useQueryClient();
  const verification = useOwnerVerification();
  const current = verification.data;
  const isOwner = role === "owner";
  const status = current?.status ?? "not_submitted";
  const locked = status === "verified" || status === "pending";

  const [legalName, setLegalName] = useState("");
  const [pan, setPan] = useState("");
  const [aadhaar, setAadhaar] = useState("");
  const [files, setFiles] = useState<Partial<Record<DocKey, File>>>({});

  useEffect(() => { if (current?.legal_name) setLegalName(current.legal_name); }, [current?.legal_name]);

  const submit = useMutation({
    mutationFn: async () => {
      const name = legalName.trim();
      if (name.length < 2) throw new Error("Enter your full legal name as on your PAN");
      const panMasked = pan ? maskedPan(pan) : current?.pan_masked ?? null;
      if (!panMasked) throw new Error("Enter a valid PAN, like ABCDE1234F");
      const last4 = aadhaar ? aadhaarLast4(aadhaar) : current?.aadhaar_last4 ?? null;
      if (!last4) throw new Error("Enter a valid 12-digit Aadhaar number");

      const paths: Record<DocKey, string | null> = {
        pan_document_path: current?.pan_document_path ?? null,
        aadhaar_front_path: current?.aadhaar_front_path ?? null,
        aadhaar_back_path: current?.aadhaar_back_path ?? null,
      };
      const uploaded: string[] = [];
      try {
        for (const doc of DOCS) {
          const file = files[doc.key];
          if (!file) continue;
          const problem = validateDocumentFile(file);
          if (problem) throw new Error(`${doc.label}: ${problem}`);
          const path = ownerDocumentPath(org.id, crypto.randomUUID(), file.name);
          const { error } = await supabase.storage.from(KYC_BUCKET).upload(path, file, { contentType: file.type, upsert: false });
          if (error) throw error;
          uploaded.push(path);
          paths[doc.key] = path;
        }
        for (const doc of DOCS) if (doc.required && !paths[doc.key]) throw new Error(`Upload your ${doc.label}`);

        const { error } = await supabase.from("organization_verifications").upsert({
          organization_id: org.id, legal_name: name, pan_masked: panMasked, aadhaar_last4: last4, ...paths, status: "pending",
        });
        if (error) throw error;
      } catch (error) {
        if (uploaded.length) await supabase.storage.from(KYC_BUCKET).remove(uploaded);
        throw error;
      }
    },
    onSuccess: () => {
      toast.success("Submitted for verification");
      setPan(""); setAadhaar(""); setFiles({});
      void qc.invalidateQueries({ queryKey: verificationQueryKey(org.id) });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Could not submit verification"),
  });

  async function view(path: string | null) {
    if (!path) return;
    const { data, error } = await supabase.storage.from(KYC_BUCKET).createSignedUrl(path, 60);
    if (error || !data?.signedUrl) { toast.error("Could not open the document"); return; }
    window.open(data.signedUrl, "_blank", "noopener,noreferrer");
  }

  if (!isAdmin(role)) {
    return (
      <div className="animate-rise mx-auto max-w-lg rounded-2xl border bg-card p-8 text-center shadow-soft">
        <span className="mx-auto grid size-12 place-items-center rounded-2xl bg-accent text-accent-foreground"><Lock /></span>
        <p className="mt-4 font-semibold">Only the workspace owner and admins can see verification</p>
        <p className="mt-1 text-sm text-muted-foreground">It holds the owner's identity documents.</p>
      </div>
    );
  }

  const panOk = !pan || isValidPan(pan);
  const aadhaarOk = !aadhaar || isValidAadhaar(aadhaar);

  return (
    <div className="animate-rise mx-auto max-w-3xl space-y-6">
      <PageHeader title="Workspace verification" description="The person who created this workspace verifies their identity with Aadhaar and PAN." />

      <section className="flex flex-wrap items-center gap-3 rounded-2xl border bg-card p-5 shadow-soft">
        <BadgeCheck className={`size-6 ${status === "verified" ? "text-emerald-600" : "text-muted-foreground"}`} />
        <div className="flex-1">
          <p className="font-semibold">Status: {VERIFICATION_STATUS_LABELS[status]}</p>
          <p className="text-sm text-muted-foreground">
            {status === "pending" && `Submitted ${shortDate(current?.submitted_at)}. We'll review your documents and update the status here.`}
            {status === "verified" && `Verified ${shortDate(current?.reviewed_at)}.`}
            {status === "rejected" && (current?.review_note ? `Needs changes: ${current.review_note}` : "Needs changes. Please check your details and documents and submit again.")}
            {status === "not_submitted" && "Not submitted yet."}
          </p>
        </div>
        <StatusBadge value={status === "not_submitted" ? "pending" : status} />
      </section>

      {current && (current.pan_masked || current.aadhaar_last4) && (
        <section className="grid gap-3 rounded-2xl border bg-card p-5 text-sm shadow-soft sm:grid-cols-3">
          <div><p className="text-muted-foreground">Legal name</p><p className="font-medium">{current.legal_name ?? "—"}</p></div>
          <div><p className="text-muted-foreground">PAN</p><p className="font-mono">{current.pan_masked ?? "—"}</p></div>
          <div><p className="text-muted-foreground">Aadhaar</p><p className="font-mono">{current.aadhaar_last4 ? `xxxx xxxx ${current.aadhaar_last4}` : "—"}</p></div>
          <div className="flex flex-wrap gap-2 sm:col-span-3">
            {DOCS.map((d) => current[d.key] && (
              <Button key={d.key} size="sm" variant="outline" className="gap-1.5" onClick={() => void view(current[d.key])}><Eye className="size-4" />{d.label}</Button>
            ))}
          </div>
        </section>
      )}

      {isOwner && !locked && (
        <form className="space-y-5 rounded-2xl border bg-card p-5 shadow-soft" onSubmit={(e) => { e.preventDefault(); submit.mutate(); }}>
          <div className="flex items-start gap-3 rounded-xl bg-accent/40 p-3 text-sm text-muted-foreground">
            <ShieldCheck className="mt-0.5 size-5 shrink-0 text-primary" />
            <p>
              Your documents are stored privately and only the workspace owner and admins can open them. We keep only your masked PAN and the
              last 4 digits of your Aadhaar as text. Please upload a <span className="font-medium text-foreground">masked Aadhaar</span> (first 8 digits hidden) if you have one.
            </p>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="legal-name">Full legal name (as on PAN)</Label>
            <Input id="legal-name" value={legalName} maxLength={120} onChange={(e) => setLegalName(e.target.value)} autoComplete="name" required />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="pan">PAN {current?.pan_masked ? <span className="text-muted-foreground">(saved: {current.pan_masked}; leave blank to keep)</span> : null}</Label>
              <Input id="pan" value={pan} onChange={(e) => setPan(e.target.value.toUpperCase())} placeholder="ABCDE1234F" maxLength={10} autoComplete="off" aria-invalid={!panOk} />
              {!panOk && <p className="text-xs text-destructive">PAN is 5 letters, 4 digits and 1 letter.</p>}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="aadhaar">Aadhaar number {current?.aadhaar_last4 ? <span className="text-muted-foreground">(saved: …{current.aadhaar_last4}; leave blank to keep)</span> : null}</Label>
              <Input id="aadhaar" value={aadhaar} onChange={(e) => setAadhaar(e.target.value.replace(/[^0-9 ]/g, ""))} placeholder="1234 5678 9012" maxLength={14} inputMode="numeric" autoComplete="off" aria-invalid={!aadhaarOk} />
              {!aadhaarOk && <p className="text-xs text-destructive">That isn't a valid 12-digit Aadhaar number.</p>}
              <p className="text-xs text-muted-foreground">Only the last 4 digits are saved.</p>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            {DOCS.map((d) => (
              <div key={d.key} className="space-y-1.5">
                <Label htmlFor={d.key}>{d.label}{d.required ? "" : " (optional)"}</Label>
                <Input id={d.key} type="file" accept={DOCUMENT_ACCEPT} onChange={(e) => setFiles((f) => ({ ...f, [d.key]: e.target.files?.[0] }))} />
                {current?.[d.key] && !files[d.key] && <p className="text-xs text-muted-foreground">Already uploaded; choose a file to replace it.</p>}
              </div>
            ))}
          </div>
          <p className="text-xs text-muted-foreground">JPG, PNG, WebP or PDF, up to 5 MB each.</p>

          <Button type="submit" disabled={submit.isPending || !panOk || !aadhaarOk} className="gap-1.5">
            {submit.isPending && <Loader2 className="size-4 animate-spin" />} Submit for verification
          </Button>
        </form>
      )}

      {!isOwner && status !== "verified" && (
        <p className="rounded-2xl border bg-card p-5 text-sm text-muted-foreground shadow-soft">Only the workspace owner can submit verification.</p>
      )}
    </div>
  );
}
