import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  AlertTriangle,
  Ban,
  Check,
  ChevronDown,
  ChevronRight,
  Copy,
  Key,
  Plus,
  ShieldAlert,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { StatusBadge } from "@/components/app/StatusBadge";
import { createApiKey, listApiKeys, revokeApiKey } from "@/lib/api-keys.functions";
import { ALL_SCOPES, READ_ONLY_SCOPES, type Scope } from "@/lib/api-auth.server";
import { isAdmin, useOrg } from "@/lib/org";

export type KeyPurpose = "api" | "mcp";

const RESOURCE_GRID: {
  resource: string;
  read: Scope;
  write?: Scope;
  writeWarning?: string;
}[] = [
  { resource: "Contacts", read: "contacts:read", write: "contacts:write" },
  { resource: "Leads", read: "leads:read" },
  { resource: "Deals", read: "deals:read" },
  {
    resource: "Calls",
    read: "calls:read",
    write: "calls:write",
    writeWarning: "Can place real phone calls that cost money.",
  },
];

function formatRelativeTime(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  if (diff < 0) return "just now";
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(dateStr).toLocaleDateString();
}

function getAppOrigin(): string {
  if (typeof window !== "undefined") return window.location.origin;
  return "https://your-crm-host.com";
}

export function ApiKeysPanel({ purpose }: { purpose: KeyPurpose }) {
  const { org, role } = useOrg();
  const queryClient = useQueryClient();
  const admin = isAdmin(role);
  const isMcp = purpose === "mcp";
  const label = isMcp ? "MCP" : "API";

  const [createOpen, setCreateOpen] = useState(false);
  const [keyName, setKeyName] = useState("");
  const [selectedScopes, setSelectedScopes] = useState<Scope[]>([...READ_ONLY_SCOPES]);
  const [busy, setBusy] = useState(false);

  // Modal to show full raw key once upon creation
  const [revealedKey, setRevealedKey] = useState<string | null>(null);
  const [copiedKey, setCopiedKey] = useState(false);
  const [copiedSnippet, setCopiedSnippet] = useState(false);

  // Revoke confirmation & collapsed revoked list
  const [revokeTarget, setRevokeTarget] = useState<{ id: string; name: string } | null>(null);
  const [revoking, setRevoking] = useState(false);
  const [showRevoked, setShowRevoked] = useState(false);

  const { data: keys = [], isLoading } = useQuery({
    queryKey: ["api-keys", org.id, purpose],
    queryFn: () => listApiKeys({ data: { organizationId: org.id, purpose } }),
    enabled: !!org.id && admin,
  });

  const activeKeys = keys.filter((k) => !k.revoked_at);
  const revokedKeys = keys.filter((k) => !!k.revoked_at);

  const toggleScope = (scope: Scope) => {
    setSelectedScopes((prev) =>
      prev.includes(scope) ? prev.filter((s) => s !== scope) : [...prev, scope]
    );
  };

  const handleSelectReadOnly = () => setSelectedScopes([...READ_ONLY_SCOPES]);
  const handleSelectAll = () => setSelectedScopes([...ALL_SCOPES]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!keyName.trim()) {
      toast.error("Please enter a key name");
      return;
    }
    if (selectedScopes.length === 0) {
      toast.error("Select at least one scope");
      return;
    }

    try {
      setBusy(true);
      const res = await createApiKey({
        data: {
          organizationId: org.id,
          name: keyName.trim(),
          scopes: selectedScopes,
          purpose,
        },
      });

      setRevealedKey(res.apiKey);
      setCreateOpen(false);
      setKeyName("");
      setSelectedScopes([...READ_ONLY_SCOPES]);
      queryClient.invalidateQueries({ queryKey: ["api-keys", org.id, purpose] });
      toast.success(`${label} key generated`);
    } catch (err: any) {
      toast.error(err?.message || `Failed to create ${label} key`);
    } finally {
      setBusy(false);
    }
  };

  const handleRevoke = async () => {
    if (!revokeTarget) return;
    try {
      setRevoking(true);
      await revokeApiKey({
        data: {
          organizationId: org.id,
          id: revokeTarget.id,
        },
      });
      queryClient.invalidateQueries({ queryKey: ["api-keys", org.id, purpose] });
      toast.success(`Revoked key: ${revokeTarget.name}`);
      setRevokeTarget(null);
    } catch (err: any) {
      toast.error(err?.message || "Failed to revoke key");
    } finally {
      setRevoking(false);
    }
  };

  const copyText = async (text: string, which: "key" | "snippet") => {
    try {
      await navigator.clipboard.writeText(text);
      if (which === "key") {
        setCopiedKey(true);
        setTimeout(() => setCopiedKey(false), 2000);
      } else {
        setCopiedSnippet(true);
        setTimeout(() => setCopiedSnippet(false), 2000);
      }
      toast.success("Copied to clipboard");
    } catch {
      toast.error("Copy failed, select the key and copy manually");
    }
  };

  if (!admin) {
    return (
      <div className="rounded-2xl border bg-card p-6 shadow-soft text-center text-muted-foreground">
        Only organization owners and administrators can manage {label} keys.
      </div>
    );
  }

  const origin = getAppOrigin();
  const exampleSnippet = revealedKey
    ? isMcp
      ? JSON.stringify(
          {
            mcpServers: {
              "yulabs-crm": {
                url: `${origin}/api/mcp`,
                headers: {
                  Authorization: `Bearer ${revealedKey}`,
                },
              },
            },
          },
          null,
          2
        )
      : `curl -H "Authorization: Bearer ${revealedKey}" ${origin}/api/v1/contacts?limit=1`
    : "";

  const renderKeyCard = (k: (typeof keys)[number]) => {
    const isRevoked = !!k.revoked_at;
    return (
      <div key={k.id} className="p-4 space-y-3 bg-card">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="font-medium text-sm text-foreground truncate">{k.name}</p>
            <p className="font-mono text-xs text-muted-foreground mt-0.5">{k.key_prefix}...</p>
          </div>
          <StatusBadge value={isRevoked ? "revoked" : "active"} />
        </div>

        <div className="flex flex-wrap gap-1">
          {k.scopes.map((s) => (
            <Badge key={s} variant="secondary" className="text-[11px] font-normal py-0">
              {s}
            </Badge>
          ))}
        </div>

        <div className="flex items-center justify-between text-xs text-muted-foreground pt-1">
          <div className="space-y-0.5">
            <p title={new Date(k.created_at).toLocaleString()}>
              Created {formatRelativeTime(k.created_at)}
              {k.created_by_name ? ` by ${k.created_by_name}` : ""}
            </p>
            <p title={k.last_used_at ? new Date(k.last_used_at).toLocaleString() : "Never used"}>
              Last used: {k.last_used_at ? formatRelativeTime(k.last_used_at) : "Never"}
            </p>
          </div>

          {!isRevoked && (
            <Button
              variant="ghost"
              size="sm"
              className="text-destructive hover:bg-destructive/10 hover:text-destructive h-8 px-2"
              onClick={() => setRevokeTarget({ id: k.id, name: k.name })}
            >
              <Ban className="h-3.5 w-3.5 mr-1" />
              Revoke
            </Button>
          )}
        </div>
      </div>
    );
  };

  const renderTableRow = (k: (typeof keys)[number]) => {
    const isRevoked = !!k.revoked_at;
    return (
      <tr key={k.id} className="hover:bg-muted/30 transition-colors">
        <td className="px-4 py-3.5 font-medium text-foreground">{k.name}</td>
        <td className="px-4 py-3.5 font-mono text-xs text-muted-foreground">{k.key_prefix}...</td>
        <td className="px-4 py-3.5">
          <div className="flex flex-wrap gap-1 max-w-xs">
            {k.scopes.map((s) => (
              <Badge key={s} variant="secondary" className="text-[11px] font-normal py-0">
                {s}
              </Badge>
            ))}
          </div>
        </td>
        <td className="px-4 py-3.5 text-muted-foreground text-xs whitespace-nowrap" title={new Date(k.created_at).toLocaleString()}>
          {formatRelativeTime(k.created_at)}
        </td>
        <td className="px-4 py-3.5 text-muted-foreground text-xs max-w-[140px] truncate">
          {k.created_by_name || "—"}
        </td>
        <td
          className="px-4 py-3.5 text-muted-foreground text-xs whitespace-nowrap"
          title={k.last_used_at ? new Date(k.last_used_at).toLocaleString() : "Never used"}
        >
          {k.last_used_at ? formatRelativeTime(k.last_used_at) : "Never"}
        </td>
        <td className="px-4 py-3.5">
          <StatusBadge value={isRevoked ? "revoked" : "active"} />
        </td>
        <td className="px-4 py-3.5 text-right">
          {!isRevoked && (
            <Button
              variant="ghost"
              size="sm"
              className="text-destructive hover:bg-destructive/10 hover:text-destructive h-8 px-2"
              onClick={() => setRevokeTarget({ id: k.id, name: k.name })}
            >
              <Ban className="h-3.5 w-3.5 mr-1" />
              Revoke
            </Button>
          )}
        </td>
      </tr>
    );
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-base font-semibold tracking-tight">{label} keys</h2>
          <p className="text-sm text-muted-foreground">
            {isMcp
              ? "Keys for connecting AI assistants such as Claude Desktop, Claude Code, and Cursor."
              : "Scoped bearer keys for calling the CRM REST API from your apps and scripts."}
          </p>
        </div>
        <Button onClick={() => setCreateOpen(true)} className="gap-2 self-start sm:self-auto">
          <Plus className="h-4 w-4" />
          Create {label} key
        </Button>
      </div>

      {isLoading ? (
        <div className="rounded-2xl border bg-card p-4 shadow-soft space-y-3">
          <Skeleton className="h-10 w-full rounded-xl" />
          <Skeleton className="h-12 w-full rounded-xl" />
          <Skeleton className="h-12 w-full rounded-xl" />
        </div>
      ) : keys.length === 0 ? (
        <div className="rounded-2xl border border-dashed bg-card p-12 text-center shadow-soft">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary">
            <Key className="h-6 w-6" />
          </div>
          <h3 className="mt-4 text-base font-semibold">No {label} keys yet</h3>
          <p className="mt-1 text-sm text-muted-foreground max-w-sm mx-auto">
            {isMcp
              ? "Create an MCP key to let AI assistants safely query your CRM."
              : "Create an API key to integrate your website, forms, or scripts with Yulabs CRM."}
          </p>
          <Button onClick={() => setCreateOpen(true)} variant="outline" className="mt-5 gap-2">
            <Plus className="h-4 w-4" />
            Create your first key
          </Button>
        </div>
      ) : (
        <div className="space-y-4">
          {activeKeys.length > 0 ? (
            <div className="rounded-2xl border bg-card shadow-soft overflow-hidden">
              <div className="sm:hidden divide-y">{activeKeys.map(renderKeyCard)}</div>
              <div className="hidden sm:block overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="border-b bg-muted/40 text-xs uppercase font-medium text-muted-foreground">
                    <tr>
                      <th className="px-4 py-3">Name</th>
                      <th className="px-4 py-3">Prefix</th>
                      <th className="px-4 py-3">Scopes</th>
                      <th className="px-4 py-3">Created</th>
                      <th className="px-4 py-3">Created by</th>
                      <th className="px-4 py-3">Last used</th>
                      <th className="px-4 py-3">Status</th>
                      <th className="px-4 py-3 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">{activeKeys.map(renderTableRow)}</tbody>
                </table>
              </div>
            </div>
          ) : (
            <div className="rounded-2xl border bg-card p-6 text-center text-sm text-muted-foreground shadow-soft">
              No active {label} keys. All existing keys have been revoked.
            </div>
          )}

          {revokedKeys.length > 0 && (
            <div className="space-y-2">
              <button
                type="button"
                onClick={() => setShowRevoked((v) => !v)}
                className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
              >
                {showRevoked ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                {showRevoked ? `Hide revoked (${revokedKeys.length})` : `Show revoked (${revokedKeys.length})`}
              </button>

              {showRevoked && (
                <div className="rounded-2xl border bg-card shadow-soft overflow-hidden opacity-85">
                  <div className="sm:hidden divide-y">{revokedKeys.map(renderKeyCard)}</div>
                  <div className="hidden sm:block overflow-x-auto">
                    <table className="w-full text-left text-sm">
                      <thead className="border-b bg-muted/40 text-xs uppercase font-medium text-muted-foreground">
                        <tr>
                          <th className="px-4 py-3">Name</th>
                          <th className="px-4 py-3">Prefix</th>
                          <th className="px-4 py-3">Scopes</th>
                          <th className="px-4 py-3">Created</th>
                          <th className="px-4 py-3">Created by</th>
                          <th className="px-4 py-3">Last used</th>
                          <th className="px-4 py-3">Status</th>
                          <th className="px-4 py-3 text-right">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y">{revokedKeys.map(renderTableRow)}</tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* CREATE KEY DIALOG */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Create {label} key</DialogTitle>
            <DialogDescription>
              {isMcp
                ? "Generate a scoped key for MCP clients. Read-only access is selected by default."
                : "Generate a scoped bearer key to authenticate requests against the REST API."}
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleCreate} className="space-y-5">
            <div className="space-y-1.5">
              <Label htmlFor="key-name">Key name</Label>
              <Input
                id="key-name"
                placeholder={isMcp ? "e.g. Claude Desktop, Cursor" : "e.g. Website lead form, Zapier"}
                value={keyName}
                onChange={(e) => setKeyName(e.target.value)}
                maxLength={80}
                required
              />
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>Scopes & permissions</Label>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={handleSelectReadOnly}
                    className="text-xs text-primary hover:underline cursor-pointer"
                  >
                    Read-only preset
                  </button>
                  <span className="text-xs text-muted-foreground">•</span>
                  <button
                    type="button"
                    onClick={handleSelectAll}
                    className="text-xs text-primary hover:underline cursor-pointer"
                  >
                    Select all
                  </button>
                </div>
              </div>

              <div className="rounded-xl border overflow-hidden">
                <table className="w-full text-left text-xs">
                  <thead className="bg-muted/40 border-b text-muted-foreground">
                    <tr>
                      <th className="px-3.5 py-2.5 font-medium">Resource</th>
                      <th className="px-3.5 py-2.5 font-medium">Read</th>
                      <th className="px-3.5 py-2.5 font-medium">Write</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {RESOURCE_GRID.map((row) => (
                      <tr key={row.resource} className="bg-card">
                        <td className="px-3.5 py-2.5 font-medium text-foreground align-top">
                          {row.resource}
                        </td>
                        <td className="px-3.5 py-2.5 align-top">
                          <label className="flex items-start gap-2 cursor-pointer select-none">
                            <Checkbox
                              checked={selectedScopes.includes(row.read)}
                              onCheckedChange={() => toggleScope(row.read)}
                              className="mt-0.5"
                            />
                            <div>
                              <span className="text-xs font-medium text-foreground block">Read</span>
                              <span className="text-[11px] font-mono text-muted-foreground">
                                {row.read}
                              </span>
                            </div>
                          </label>
                        </td>
                        <td className="px-3.5 py-2.5 align-top">
                          {row.write ? (
                            <div className="space-y-1">
                              <label className="flex items-start gap-2 cursor-pointer select-none">
                                <Checkbox
                                  checked={selectedScopes.includes(row.write)}
                                  onCheckedChange={() => toggleScope(row.write!)}
                                  className="mt-0.5"
                                />
                                <div>
                                  <span className="text-xs font-medium text-foreground block">Write</span>
                                  <span className="text-[11px] font-mono text-muted-foreground">
                                    {row.write}
                                  </span>
                                </div>
                              </label>
                              {row.writeWarning && (
                                <p className="flex items-start gap-1 text-[11px] text-amber-600 dark:text-amber-400">
                                  <AlertTriangle className="h-3 w-3 shrink-0 mt-0.5" />
                                  <span>{row.writeWarning}</span>
                                </p>
                              )}
                            </div>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <DialogFooter className="gap-2 sm:gap-0">
              <Button
                type="button"
                variant="outline"
                onClick={() => setCreateOpen(false)}
                disabled={busy}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={busy}>
                {busy ? "Generating..." : "Generate key"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* REVEAL KEY MODAL (SHOWN ONCE - BLOCKS ESC & OUTSIDE CLICK) */}
      <Dialog open={!!revealedKey}>
        <DialogContent
          className="max-w-lg [&>button]:hidden"
          onInteractOutside={(e) => e.preventDefault()}
          onEscapeKeyDown={(e) => e.preventDefault()}
        >
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-emerald-600">
              <Key className="h-5 w-5" />
              {label} key generated
            </DialogTitle>
            <DialogDescription>
              Copy your {label} key now. For your security, you will not be able to view it again.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-1">
            <div className="relative">
              <pre className="p-3 pr-12 rounded-xl bg-muted font-mono text-xs break-all border select-all">
                {revealedKey}
              </pre>
              <Button
                size="sm"
                variant="outline"
                className="absolute right-1.5 top-1.5 h-8 w-8 p-0"
                onClick={() => revealedKey && copyText(revealedKey, "key")}
                aria-label="Copy key"
              >
                {copiedKey ? <Check className="h-4 w-4 text-emerald-600" /> : <Copy className="h-4 w-4" />}
              </Button>
            </div>

            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-foreground">
                  {isMcp ? "MCP config snippet" : "First request example"}
                </span>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-7 px-2 text-xs gap-1"
                  onClick={() => copyText(exampleSnippet, "snippet")}
                >
                  {copiedSnippet ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <Copy className="h-3.5 w-3.5" />}
                  {copiedSnippet ? "Copied" : "Copy"}
                </Button>
              </div>
              <pre className="p-3 rounded-xl bg-muted/70 font-mono text-[11px] overflow-x-auto border select-all">
                {exampleSnippet}
              </pre>
            </div>

            <div className="flex items-start gap-2 rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-700 dark:text-amber-400">
              <ShieldAlert className="h-4 w-4 shrink-0 mt-0.5" />
              <p>
                Store this key securely. If you lose it, you will need to revoke it and generate a new one.
              </p>
            </div>
          </div>

          <DialogFooter>
            <Button className="w-full" onClick={() => setRevealedKey(null)}>
              I've copied the key
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* REVOKE CONFIRMATION DIALOG */}
      <Dialog open={!!revokeTarget} onOpenChange={(open) => !open && setRevokeTarget(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="text-destructive">Revoke {label} key</DialogTitle>
            <DialogDescription>
              Are you sure you want to revoke <strong className="text-foreground">{revokeTarget?.name}</strong>?
              Any application using this key will immediately be denied access.
            </DialogDescription>
          </DialogHeader>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setRevokeTarget(null)} disabled={revoking}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleRevoke} disabled={revoking}>
              {revoking ? "Revoking..." : "Revoke key"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
