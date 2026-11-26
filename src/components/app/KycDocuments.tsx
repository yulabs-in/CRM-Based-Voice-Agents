// Client KYC documents: upload ID proofs to the private kyc-documents bucket, view them through short-lived
// signed links, and mark each one verified or rejected. Access matches client KYC (sales roles; managers delete).
import { useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Check, Eye, FileText, Loader2, Trash2, Upload, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { StatusBadge } from "@/components/app/StatusBadge";
import { supabase } from "@/lib/supabase";
import { canDelete, useOrg } from "@/lib/org";
import { shortDate } from "@/lib/format";
import { useContactsById, useKyc } from "@/lib/sales-data";
import {
  DOCUMENT_ACCEPT, KYC_BUCKET, KYC_DOC_TYPES, clientDocumentPath, docTypeLabel, validateDocumentFile, type KycDocType,
} from "@/lib/kyc-documents";

type KycDocument = {
  id: string; contact_id: string; doc_type: string; storage_path: string; file_name: string; mime_type: string;
  size_bytes: number; status: string; notes: string | null; created_at: string; verified_at: string | null;
};

const ALL = "__all";
const kb = (bytes: number) => (bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`);

export function KycDocuments() {
  const { org, role } = useOrg();
  const qc = useQueryClient();
  const kyc = useKyc();
  const contactIds = useMemo(() => (kyc.data ?? []).map((k) => k.contact_id), [kyc.data]);
  const contacts = useContactsById(contactIds);
  const [clientId, setClientId] = useState<string>(ALL);
  const [docType, setDocType] = useState<KycDocType>("aadhaar");
  const [notes, setNotes] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  const docs = useQuery({
    queryKey: ["kyc_documents", org.id],
    queryFn: async () => {
      const { data, error } = await supabase.from("kyc_documents")
        .select("id, contact_id, doc_type, storage_path, file_name, mime_type, size_bytes, status, notes, created_at, verified_at")
        .eq("organization_id", org.id).order("created_at", { ascending: false }).limit(500);
      if (error) throw error;
      return data as KycDocument[];
    },
  });

  const clientName = (id: string) => contacts.data?.get(id)?.name ?? "Client";
  const clients = useMemo(
    () => [...new Set(contactIds)].map((id) => ({ id, name: clientName(id) })).sort((a, b) => a.name.localeCompare(b.name)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [contactIds, contacts.data],
  );
  const shown = (docs.data ?? []).filter((d) => clientId === ALL || d.contact_id === clientId);
  const refresh = () => qc.invalidateQueries({ queryKey: ["kyc_documents", org.id] });

  const upload = useMutation({
    mutationFn: async () => {
      if (clientId === ALL) throw new Error("Choose the client first");
      if (!file) throw new Error("Choose a file to upload");
      const problem = validateDocumentFile(file);
      if (problem) throw new Error(problem);
      const id = crypto.randomUUID();
      const path = clientDocumentPath(org.id, clientId, id, file.name);
      const { error: storageError } = await supabase.storage.from(KYC_BUCKET).upload(path, file, { contentType: file.type, upsert: false });
      if (storageError) throw storageError;
      const { error } = await supabase.from("kyc_documents").insert({
        id, organization_id: org.id, contact_id: clientId, doc_type: docType, storage_path: path,
        file_name: file.name.slice(0, 200), mime_type: file.type, size_bytes: file.size, notes: notes.trim() || null,
      });
      if (error) {
        await supabase.storage.from(KYC_BUCKET).remove([path]);
        throw error;
      }
    },
    onSuccess: () => {
      toast.success("Document uploaded");
      setFile(null); setNotes("");
      if (fileInput.current) fileInput.current.value = "";
      void refresh();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Could not upload that document"),
  });

  const review = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: "verified" | "rejected" | "pending" }) => {
      const { error } = await supabase.from("kyc_documents").update({ status }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => void refresh(),
    onError: (e) => toast.error(e instanceof Error ? e.message : "Could not update the document"),
  });

  const remove = useMutation({
    mutationFn: async (doc: KycDocument) => {
      const { error } = await supabase.from("kyc_documents").delete().eq("id", doc.id);
      if (error) throw error;
      await supabase.storage.from(KYC_BUCKET).remove([doc.storage_path]);
    },
    onSuccess: () => { toast.success("Document deleted"); void refresh(); },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Could not delete the document"),
  });

  async function view(doc: KycDocument) {
    const { data, error } = await supabase.storage.from(KYC_BUCKET).createSignedUrl(doc.storage_path, 60);
    if (error || !data?.signedUrl) { toast.error("Could not open the document"); return; }
    window.open(data.signedUrl, "_blank", "noopener,noreferrer");
  }

  return (
    <section className="space-y-4 rounded-2xl border bg-card p-5 shadow-soft" aria-labelledby="kyc-docs-title">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 id="kyc-docs-title" className="text-base font-semibold">KYC documents</h2>
          <p className="text-sm text-muted-foreground">
            ID proofs for clients with a KYC record. Files are private and open through a link that expires in a minute.
            Upload a <span className="font-medium text-foreground">masked Aadhaar</span> (first 8 digits hidden) wherever possible.
          </p>
        </div>
        <Select value={clientId} onValueChange={setClientId}>
          <SelectTrigger className="w-60" aria-label="Client"><SelectValue placeholder="Client" /></SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>All clients</SelectItem>
            {clients.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      <form
        className="grid gap-3 rounded-xl border bg-muted/30 p-4 sm:grid-cols-[1fr_1fr_1.4fr_auto] sm:items-end"
        onSubmit={(e) => { e.preventDefault(); upload.mutate(); }}
      >
        <div className="space-y-1.5">
          <Label htmlFor="kyc-doc-type">Document</Label>
          <Select value={docType} onValueChange={(v) => setDocType(v as KycDocType)}>
            <SelectTrigger id="kyc-doc-type"><SelectValue /></SelectTrigger>
            <SelectContent>{KYC_DOC_TYPES.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="kyc-doc-file">File (JPG, PNG, WebP or PDF, up to 5 MB)</Label>
          <Input id="kyc-doc-file" ref={fileInput} type="file" accept={DOCUMENT_ACCEPT} onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="kyc-doc-notes">Notes (optional)</Label>
          <Input id="kyc-doc-notes" value={notes} maxLength={1000} onChange={(e) => setNotes(e.target.value)} placeholder="e.g. front side" />
        </div>
        <Button type="submit" disabled={upload.isPending || clientId === ALL || !file} className="gap-1.5">
          {upload.isPending ? <Loader2 className="size-4 animate-spin" /> : <Upload className="size-4" />} Upload
        </Button>
        {clientId === ALL && <p className="text-xs text-muted-foreground sm:col-span-4">Choose a client above to upload a document for them.</p>}
      </form>

      {docs.isLoading ? (
        <p className="text-sm text-muted-foreground">Loading documents…</p>
      ) : shown.length === 0 ? (
        <p className="text-sm text-muted-foreground">No documents yet{clientId !== ALL ? " for this client" : ""}.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-xs text-muted-foreground">
              <tr><th className="py-2 pr-3">Client</th><th className="py-2 pr-3">Document</th><th className="py-2 pr-3">File</th><th className="py-2 pr-3">Status</th><th className="py-2 pr-3">Uploaded</th><th className="py-2 text-right">Actions</th></tr>
            </thead>
            <tbody>
              {shown.map((d) => (
                <tr key={d.id} className="border-t">
                  <td className="py-2 pr-3 font-medium">{clientName(d.contact_id)}</td>
                  <td className="py-2 pr-3">{docTypeLabel(d.doc_type)}{d.notes ? <span className="block text-xs text-muted-foreground">{d.notes}</span> : null}</td>
                  <td className="py-2 pr-3"><span className="inline-flex items-center gap-1.5"><FileText className="size-3.5 text-muted-foreground" />{d.file_name}</span><span className="block text-xs text-muted-foreground">{kb(d.size_bytes)}</span></td>
                  <td className="py-2 pr-3"><StatusBadge value={d.status} /></td>
                  <td className="py-2 pr-3">{shortDate(d.created_at)}</td>
                  <td className="py-2">
                    <div className="flex justify-end gap-1">
                      <Button size="sm" variant="ghost" onClick={() => void view(d)} aria-label={`View ${d.file_name}`}><Eye className="size-4" /></Button>
                      {d.status !== "verified" && (
                        <Button size="sm" variant="ghost" onClick={() => review.mutate({ id: d.id, status: "verified" })} aria-label="Mark verified"><Check className="size-4 text-emerald-600" /></Button>
                      )}
                      {d.status !== "rejected" && (
                        <Button size="sm" variant="ghost" onClick={() => review.mutate({ id: d.id, status: "rejected" })} aria-label="Mark rejected"><X className="size-4 text-destructive" /></Button>
                      )}
                      {canDelete(role) && (
                        <Button size="sm" variant="ghost" onClick={() => { if (confirm(`Delete ${d.file_name}? This can't be undone.`)) remove.mutate(d); }} aria-label={`Delete ${d.file_name}`}>
                          <Trash2 className="size-4" />
                        </Button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
