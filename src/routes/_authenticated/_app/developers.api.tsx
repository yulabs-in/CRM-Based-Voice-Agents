import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { BookOpen, Check, Copy, Terminal } from "lucide-react";
import { PageHeader } from "@/components/app/PageHeader";
import { ApiKeysPanel } from "@/components/app/ApiKeysPanel";
import { Button } from "@/components/ui/button";
import { isAdmin, useOrg } from "@/lib/org";

export const Route = createFileRoute("/_authenticated/_app/developers/api")({
  head: () => ({
    meta: [
      { title: "API — Yulabs CRM" },
      { name: "description", content: "Manage REST API keys and integrate external apps with Yulabs CRM." },
    ],
  }),
  component: DevelopersApiPage,
});

function DevelopersApiPage() {
  const { role } = useOrg();
  const admin = isAdmin(role);
  const [copiedBase, setCopiedBase] = useState(false);
  const [copiedCurl, setCopiedCurl] = useState(false);

  const origin = typeof window !== "undefined" ? window.location.origin : "https://your-crm-host.com";
  const baseUrl = `${origin}/api/v1`;
  const curlCommand = `curl -H "Authorization: Bearer yk_live_..." "${baseUrl}/contacts?limit=1"`;

  async function copy(text: string, which: "base" | "curl") {
    try {
      await navigator.clipboard.writeText(text);
      if (which === "base") {
        setCopiedBase(true);
        setTimeout(() => setCopiedBase(false), 2000);
      } else {
        setCopiedCurl(true);
        setTimeout(() => setCopiedCurl(false), 2000);
      }
      toast.success("Copied to clipboard");
    } catch {
      toast.error("Copy failed, please select and copy manually");
    }
  }

  return (
    <div className="animate-rise space-y-6">
      <PageHeader
        title="API"
        description="Manage REST API keys to read and update CRM contacts, leads, deals, and calls."
      />

      {admin && (
        <div className="grid gap-4 lg:grid-cols-2">
          <div className="rounded-2xl border bg-card p-5 shadow-soft space-y-3">
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-sm font-semibold">Base URL</h2>
              <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                <BookOpen className="h-3.5 w-3.5" />
                Docs coming soon (#7)
              </span>
            </div>
            <div className="flex items-center gap-2">
              <code className="flex-1 rounded-xl border bg-muted/60 px-3 py-2 font-mono text-xs truncate">
                {baseUrl}
              </code>
              <Button
                variant="outline"
                size="sm"
                className="shrink-0 gap-1.5"
                onClick={() => copy(baseUrl, "base")}
              >
                {copiedBase ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <Copy className="h-3.5 w-3.5" />}
                {copiedBase ? "Copied" : "Copy"}
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Available endpoints: <code className="font-mono">/contacts</code>,{" "}
              <code className="font-mono">/leads</code>, <code className="font-mono">/deals</code>,{" "}
              <code className="font-mono">/calls</code>.
            </p>
          </div>

          <div className="rounded-2xl border bg-card p-5 shadow-soft space-y-3">
            <div className="flex items-center justify-between gap-2">
              <h2 className="flex items-center gap-1.5 text-sm font-semibold">
                <Terminal className="h-4 w-4 text-muted-foreground" />
                First request
              </h2>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 px-2 text-xs gap-1"
                onClick={() => copy(curlCommand, "curl")}
              >
                {copiedCurl ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <Copy className="h-3.5 w-3.5" />}
                {copiedCurl ? "Copied" : "Copy"}
              </Button>
            </div>
            <pre className="rounded-xl border bg-muted/60 p-3 font-mono text-[11px] overflow-x-auto select-all">
              {curlCommand}
            </pre>
          </div>
        </div>
      )}

      <ApiKeysPanel purpose="api" />
    </div>
  );
}
