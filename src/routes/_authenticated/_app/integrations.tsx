import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { CheckCircle2, Copy, Loader2, Mic, RefreshCw, XCircle } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/app/PageHeader";
import { useOrg } from "@/lib/org";
import { pageHead } from "@/lib/seo";
import { sarvamStatus } from "@/server/ai.functions";

export const Route = createFileRoute("/_authenticated/_app/integrations")({
  head: () => pageHead("Integrations", "Connect Sarvam voice agents and other services."),
  component: Page,
});

function Page() {
  const { org } = useOrg();
  const check = useServerFn(sarvamStatus);
  const s = useQuery({ queryKey: ["sarvam-status"], queryFn: () => check() });
  const webhook = typeof window === "undefined" ? "" : `${window.location.origin}/api/public/sarvam-webhook`;
  const copy = (t: string) => { navigator.clipboard.writeText(t); toast.success("Copied"); };
  return (
    <div className="animate-rise space-y-5">
      <PageHeader title="Integrations" description="Connect the services that power your calls." />
      <div className="rounded-2xl border bg-card p-5 shadow-soft">
        <div className="flex items-center gap-3">
          <span className="grid size-11 place-items-center rounded-xl bg-accent text-accent-foreground"><Mic /></span>
          <div><p className="font-semibold">Sarvam Voice Agents</p><p className="text-sm text-muted-foreground">AI voice calls in Indian languages.</p></div>
          <div className="ml-auto flex items-center gap-2 text-sm">
            {s.isLoading ? <Loader2 className="size-4 animate-spin" /> : s.data?.connected ? <CheckCircle2 className="size-4 text-success" /> : <XCircle className="size-4 text-destructive" />}
            <span>{s.isLoading ? "Checking…" : s.data?.message}</span>
            <Button size="icon" variant="ghost" aria-label="Re-check" onClick={() => s.refetch()}><RefreshCw /></Button>
          </div>
        </div>
        <div className="mt-5 space-y-3 rounded-xl bg-muted/60 p-4 text-sm">
          <p className="font-semibold">Sync calls into the CRM</p>
          <p className="text-muted-foreground">Send call events from Sarvam to this address with the header <code>x-webhook-secret</code>.</p>
          {[["Webhook address", webhook], ["Your workspace ID", org.id]].map(([k, v]) => (
            <div key={k} className="flex items-center gap-2"><span className="w-36 text-muted-foreground">{k}</span><code className="flex-1 truncate rounded-lg bg-background px-2 py-1">{v}</code><Button size="icon" variant="ghost" aria-label={`Copy ${k}`} onClick={() => copy(v!)}><Copy /></Button></div>
          ))}
        </div>
      </div>
    </div>
  );
}
