import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { Check, Copy, Plug, RefreshCw } from "lucide-react";
import { PageHeader } from "@/components/app/PageHeader";
import { ApiKeysPanel } from "@/components/app/ApiKeysPanel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { isAdmin, useOrg } from "@/lib/org";

export const Route = createFileRoute("/_authenticated/_app/developers/mcp")({
  head: () => ({
    meta: [
      { title: "MCP — Yulabs CRM" },
      { name: "description", content: "Connect Claude Desktop, Claude Code, and Cursor to Yulabs CRM via MCP." },
    ],
  }),
  component: DevelopersMcpPage,
});

function DevelopersMcpPage() {
  const { role } = useOrg();
  const admin = isAdmin(role);
  const [copiedUrl, setCopiedUrl] = useState(false);
  const [copiedConfig, setCopiedConfig] = useState(false);
  const [testKey, setTestKey] = useState("");
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; text: string } | null>(null);

  const origin = typeof window !== "undefined" ? window.location.origin : "https://your-crm-host.com";
  const mcpUrl = `${origin}/api/mcp`;

  const desktopJson = JSON.stringify(
    {
      mcpServers: {
        "yulabs-crm": {
          url: mcpUrl,
          headers: {
            Authorization: "Bearer yk_live_...",
          },
        },
      },
    },
    null,
    2
  );

  const claudeCodeCmd = `claude mcp add --transport http yulabs-crm ${mcpUrl} --header "Authorization: Bearer yk_live_..."`;

  async function copy(text: string, which: "url" | "config") {
    try {
      await navigator.clipboard.writeText(text);
      if (which === "url") {
        setCopiedUrl(true);
        setTimeout(() => setCopiedUrl(false), 2000);
      } else {
        setCopiedConfig(true);
        setTimeout(() => setCopiedConfig(false), 2000);
      }
      toast.success("Copied to clipboard");
    } catch {
      toast.error("Copy failed, please select and copy manually");
    }
  }

  async function handleTestConnection() {
    setTesting(true);
    setTestResult(null);
    try {
      const headers: Record<string, string> = {};
      const trimmed = testKey.trim();
      if (trimmed) {
        headers.Authorization = trimmed.startsWith("Bearer ") ? trimmed : `Bearer ${trimmed}`;
      }

      const res = await fetch(mcpUrl, { method: "GET", headers });
      const contentType = res.headers.get("content-type") ?? "";
      const isJson = contentType.includes("application/json");

      if (res.status === 401 || res.status === 403) {
        setTestResult({
          ok: false,
          text: trimmed
            ? `MCP server reachable, key rejected (HTTP ${res.status}). Check that the key is active and valid.`
            : `MCP server reachable (HTTP ${res.status}). Paste an MCP key above to verify authentication.`,
        });
      } else if (res.status === 405 && isJson) {
        setTestResult({
          ok: true,
          text: "MCP server reachable (HTTP 405, POST required for JSON-RPC).",
        });
      } else if (res.ok && isJson) {
        setTestResult({
          ok: true,
          text: trimmed ? "MCP server reachable and key works." : "MCP server reachable.",
        });
      } else {
        setTestResult({
          ok: false,
          text: "MCP server ships with #6 — the /api/mcp endpoint is not deployed yet.",
        });
      }
    } catch (err: unknown) {
      setTestResult({
        ok: false,
        text: err instanceof Error ? err.message : "Could not reach MCP endpoint",
      });
    } finally {
      setTesting(false);
    }
  }

  return (
    <div className="animate-rise space-y-6">
      <PageHeader
        title="MCP"
        description="Connect AI assistants (Claude Desktop, Claude Code, Cursor) to your CRM using scoped MCP keys."
      />

      {admin && (
        <div className="grid gap-4 lg:grid-cols-2">
          <div className="rounded-2xl border bg-card p-5 shadow-soft space-y-3">
            <div className="flex items-center justify-between gap-2">
              <h2 className="flex items-center gap-1.5 text-sm font-semibold">
                <Plug className="h-4 w-4 text-muted-foreground" />
                MCP server URL
              </h2>
              <span className="text-xs text-muted-foreground">MCP server ships with #6</span>
            </div>

            <div className="flex items-center gap-2">
              <code className="flex-1 rounded-xl border bg-muted/60 px-3 py-2 font-mono text-xs truncate">
                {mcpUrl}
              </code>
              <Button
                variant="outline"
                size="sm"
                className="shrink-0 gap-1.5"
                onClick={() => copy(mcpUrl, "url")}
              >
                {copiedUrl ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <Copy className="h-3.5 w-3.5" />}
                {copiedUrl ? "Copied" : "Copy"}
              </Button>
            </div>

            <div className="flex flex-col gap-2 sm:flex-row sm:items-center pt-1">
              <Input
                type="password"
                placeholder="Paste MCP key (yk_live_...) to test"
                value={testKey}
                onChange={(e) => setTestKey(e.target.value)}
                className="h-8 text-xs font-mono flex-1"
              />
              <Button
                variant="outline"
                size="sm"
                className="h-8 px-3 text-xs gap-1.5 shrink-0"
                onClick={handleTestConnection}
                disabled={testing}
              >
                <RefreshCw className={`h-3 w-3 ${testing ? "animate-spin" : ""}`} />
                {testing ? "Testing..." : "Test connection"}
              </Button>
            </div>

            {testResult && (
              <p
                className={`rounded-xl border px-3 py-2 text-xs ${
                  testResult.ok
                    ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
                    : "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-400"
                }`}
              >
                {testResult.text}
              </p>
            )}
          </div>

          <div className="rounded-2xl border bg-card p-5 shadow-soft space-y-3">
            <Tabs defaultValue="desktop" className="w-full">
              <div className="flex items-center justify-between gap-2 mb-2">
                <TabsList className="h-8">
                  <TabsTrigger value="desktop" className="text-xs px-2.5 py-1">
                    Claude Desktop / Cursor
                  </TabsTrigger>
                  <TabsTrigger value="claude-code" className="text-xs px-2.5 py-1">
                    Claude Code
                  </TabsTrigger>
                </TabsList>
              </div>

              <TabsContent value="desktop" className="mt-0 space-y-2">
                <div className="relative">
                  <pre className="rounded-xl border bg-muted/60 p-3 pr-10 font-mono text-[11px] overflow-x-auto select-all">
                    {desktopJson}
                  </pre>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="absolute right-1.5 top-1.5 h-7 w-7 p-0"
                    onClick={() => copy(desktopJson, "config")}
                    aria-label="Copy config"
                  >
                    {copiedConfig ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <Copy className="h-3.5 w-3.5" />}
                  </Button>
                </div>
              </TabsContent>

              <TabsContent value="claude-code" className="mt-0 space-y-2">
                <div className="relative">
                  <pre className="rounded-xl border bg-muted/60 p-3 pr-10 font-mono text-[11px] overflow-x-auto select-all">
                    {claudeCodeCmd}
                  </pre>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="absolute right-1.5 top-1.5 h-7 w-7 p-0"
                    onClick={() => copy(claudeCodeCmd, "config")}
                    aria-label="Copy command"
                  >
                    {copiedConfig ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <Copy className="h-3.5 w-3.5" />}
                  </Button>
                </div>
              </TabsContent>
            </Tabs>
          </div>
        </div>
      )}

      <ApiKeysPanel purpose="mcp" />
    </div>
  );
}
