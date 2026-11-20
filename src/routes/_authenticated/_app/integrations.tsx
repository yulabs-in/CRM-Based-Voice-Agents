import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { CheckCircle2, Copy, Loader2, Mic, RefreshCw, Save, XCircle } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PageHeader } from "@/components/app/PageHeader";
import { isAdmin, useOrg } from "@/lib/org";
import { pageHead } from "@/lib/seo";
import { sarvamStatus } from "@/lib/functions/ai.functions";
import { saveSarvamWorkspace } from "@/lib/sarvam.functions";
import { SARVAM_DEFAULTS } from "@/lib/sarvam-defaults";

export const Route = createFileRoute("/_authenticated/_app/integrations")({
  head: () => pageHead("Integrations", "Connect Sarvam voice agents and other services."),
  component: Page,
});

function Page() {
  const { org, role } = useOrg();
  const check = useServerFn(sarvamStatus);
  const saveWorkspace = useServerFn(saveSarvamWorkspace);
  const [sarvamOrgId, setSarvamOrgId] = useState(org.sarvam_organization_id?.trim() || SARVAM_DEFAULTS.organizationId);
  const [sarvamWorkspaceId, setSarvamWorkspaceId] = useState(org.sarvam_workspace_id?.trim() || SARVAM_DEFAULTS.workspaceId);
  const [saving, setSaving] = useState(false);
  const s = useQuery({ queryKey: ["sarvam-status", org.id], queryFn: () => check({ data: { organizationId: org.id } }) });
  const webhook = typeof window === "undefined" ? "" : `${window.location.origin}/api/public/sarvam-call-webhook`;
  const copy = (text: string) => { void navigator.clipboard.writeText(text); toast.success("Copied"); };

  async function handleSave() {
    setSaving(true);
    try {
      await saveWorkspace({ data: { organizationId: org.id, sarvamOrganizationId: sarvamOrgId, sarvamWorkspaceId } });
      toast.success("Sarvam workspace saved");
      void s.refetch();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not save Sarvam workspace");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="animate-rise space-y-5">
      <PageHeader title="Integrations" description="Connect the services that power your calls." />
      <section className="space-y-5 border-y py-5">
        <div className="flex flex-wrap items-center gap-3">
          <span className="grid size-11 place-items-center rounded-md bg-accent text-accent-foreground"><Mic /></span>
          <div><p className="font-semibold">Sarvam Voice Agents</p><p className="text-sm text-muted-foreground">AI voice calls in Indian languages.</p></div>
          <div className="ml-auto flex items-center gap-2 text-sm">
            {s.isLoading ? <Loader2 className="size-4 animate-spin" /> : s.data?.connected ? <CheckCircle2 className="size-4 text-success" /> : <XCircle className="size-4 text-destructive" />}
            <span>{s.isLoading ? "Checking…" : s.data?.message}</span>
            <Button size="icon" variant="ghost" aria-label="Re-check Sarvam connection" onClick={() => s.refetch()}><RefreshCw /></Button>
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2"><Label htmlFor="sarvam-org-id">Sarvam organization ID</Label><Input id="sarvam-org-id" value={sarvamOrgId} onChange={(event) => setSarvamOrgId(event.target.value)} placeholder="From your Sarvam workspace" /></div>
          <div className="space-y-2"><Label htmlFor="sarvam-workspace-id">Sarvam workspace ID</Label><Input id="sarvam-workspace-id" value={sarvamWorkspaceId} onChange={(event) => setSarvamWorkspaceId(event.target.value)} placeholder="From your Sarvam workspace" /></div>
        </div>
        {isAdmin(role) && <Button variant="outline" onClick={handleSave} disabled={saving}>{saving ? <Loader2 className="animate-spin" /> : <Save />} Save workspace details</Button>}

        <div className="space-y-2 border-t pt-4 text-sm">
          <p className="font-semibold">Call result callback</p>
          <p className="text-muted-foreground">The CRM sends this address to Sarvam with every call and campaign automatically, using the server's <code>PUBLIC_APP_URL</code> (it must be a public https address — not localhost). Results are matched with private per-call and per-campaign tokens.</p>
          <div className="flex min-w-0 items-center gap-2"><code className="min-w-0 flex-1 truncate rounded-md bg-muted px-2 py-1">{webhook}</code><Button size="icon" variant="ghost" aria-label="Copy call result callback address" onClick={() => copy(webhook)}><Copy /></Button></div>
        </div>
      </section>
    </div>
  );
}