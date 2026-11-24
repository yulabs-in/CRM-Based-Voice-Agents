import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Check, Copy, Key, Plus, ShieldAlert, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { createApiKey, listApiKeys, revokeApiKey } from "@/lib/api-keys.functions";
import { ALL_SCOPES, READ_ONLY_SCOPES, type Scope } from "@/lib/api-auth.server";
import { isAdmin, useOrg } from "@/lib/org";

const SCOPE_DESCRIPTIONS: Record<Scope, string> = {
  "contacts:read": "View contacts and custom fields",
  "contacts:write": "Create and update contacts",
  "leads:read": "View leads and pipeline status",
  "deals:read": "View deals and stages",
  "calls:read": "View call logs, transcripts, and recordings",
  "calls:write": "Trigger outbound AI voice calls",
};

export function ApiKeysSection() {
  const { org, role } = useOrg();
  const queryClient = useQueryClient();
  const admin = isAdmin(role);

  const [createOpen, setCreateOpen] = useState(false);
  const [keyName, setKeyName] = useState("");
  const [selectedScopes, setSelectedScopes] = useState<Scope[]>(["contacts:read", "leads:read"]);
  const [busy, setBusy] = useState(false);

  // Modal to show full raw key once upon creation
  const [revealedKey, setRevealedKey] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  // Key to revoke confirmation
  const [revokeTarget, setRevokeTarget] = useState<{ id: string; name: string } | null>(null);
  const [revoking, setRevoking] = useState(false);

  const { data: keys = [], isLoading } = useQuery({
    queryKey: ["api-keys", org.id],
    queryFn: () => listApiKeys({ data: { organizationId: org.id } }),
    enabled: !!org.id && admin,
  });

  const toggleScope = (scope: Scope) => {
    setSelectedScopes((prev) =>
      prev.includes(scope) ? prev.filter((s) => s !== scope) : [...prev, scope]
    );
  };

  const handleSelectReadOnly = () => {
    setSelectedScopes([...READ_ONLY_SCOPES]);
  };

  const handleSelectAll = () => {
    setSelectedScopes([...ALL_SCOPES]);
  };

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
        },
      });

      setRevealedKey(res.apiKey);
      setCreateOpen(false);
      setKeyName("");
      setSelectedScopes(["contacts:read", "leads:read"]);
      queryClient.invalidateQueries({ queryKey: ["api-keys", org.id] });
      toast.success("API Key generated successfully");
    } catch (err: any) {
      toast.error(err?.message || "Failed to create API key");
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
      queryClient.invalidateQueries({ queryKey: ["api-keys", org.id] });
      toast.success(`Revoked key: ${revokeTarget.name}`);
      setRevokeTarget(null);
    } catch (err: any) {
      toast.error(err?.message || "Failed to revoke key");
    } finally {
      setRevoking(false);
    }
  };

  const copyToClipboard = async (text: string) => {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    toast.success("API key copied to clipboard");
    setTimeout(() => setCopied(false), 2000);
  };

  if (!admin) {
    return (
      <div className="rounded-2xl border bg-card p-6 shadow-soft text-center text-muted-foreground">
        Only organization owners and administrators can manage API keys.
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-lg font-semibold tracking-tight">API & MCP Keys</h2>
          <p className="text-sm text-muted-foreground">
            Connect your own apps, websites, scripts, or AI assistants securely to Yulabs CRM.
          </p>
        </div>
        <Button onClick={() => setCreateOpen(true)} className="gap-2">
          <Plus className="h-4 w-4" />
          Create API Key
        </Button>
      </div>

      {isLoading ? (
        <div className="rounded-2xl border bg-card p-8 text-center text-muted-foreground">
          Loading API keys...
        </div>
      ) : keys.length === 0 ? (
        <div className="rounded-2xl border border-dashed bg-card p-12 text-center shadow-soft">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary">
            <Key className="h-6 w-6" />
          </div>
          <h3 className="mt-4 text-base font-semibold">No API keys yet</h3>
          <p className="mt-1 text-sm text-muted-foreground max-w-sm mx-auto">
            Create one to connect your website, Google Sheets, or AI assistant via the REST API or MCP server.
          </p>
          <Button onClick={() => setCreateOpen(true)} variant="outline" className="mt-5 gap-2">
            <Plus className="h-4 w-4" />
            Create your first key
          </Button>
        </div>
      ) : (
        <div className="rounded-2xl border bg-card shadow-soft overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b bg-muted/40 text-xs uppercase font-medium text-muted-foreground">
                <tr>
                  <th className="px-6 py-3.5">Name</th>
                  <th className="px-6 py-3.5">Key Prefix</th>
                  <th className="px-6 py-3.5">Scopes</th>
                  <th className="px-6 py-3.5">Last Used</th>
                  <th className="px-6 py-3.5">Status</th>
                  <th className="px-6 py-3.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {keys.map((k) => {
                  const isRevoked = !!k.revoked_at;
                  return (
                    <tr key={k.id} className="hover:bg-muted/30 transition-colors">
                      <td className="px-6 py-4 font-medium text-foreground">{k.name}</td>
                      <td className="px-6 py-4 font-mono text-xs text-muted-foreground">
                        {k.key_prefix}...
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex flex-wrap gap-1 max-w-xs">
                          {k.scopes.map((s) => (
                            <Badge key={s} variant="secondary" className="text-[11px] font-normal py-0">
                              {s}
                            </Badge>
                          ))}
                        </div>
                      </td>
                      <td className="px-6 py-4 text-muted-foreground text-xs">
                        {k.last_used_at
                          ? new Date(k.last_used_at).toLocaleDateString("en-IN", {
                              day: "numeric",
                              month: "short",
                              hour: "2-digit",
                              minute: "2-digit",
                            })
                          : "Never"}
                      </td>
                      <td className="px-6 py-4">
                        {isRevoked ? (
                          <Badge variant="destructive" className="text-xs">
                            Revoked
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="border-emerald-500/30 text-emerald-600 bg-emerald-500/10 text-xs">
                            Active
                          </Badge>
                        )}
                      </td>
                      <td className="px-6 py-4 text-right">
                        {!isRevoked && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-destructive hover:bg-destructive/10 hover:text-destructive h-8 px-2"
                            onClick={() => setRevokeTarget({ id: k.id, name: k.name })}
                          >
                            <Trash2 className="h-4 w-4 mr-1" />
                            Revoke
                          </Button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* CREATE KEY DIALOG */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Create New API Key</DialogTitle>
            <DialogDescription>
              Generate a scoped API key to authenticate requests against the REST API.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleCreate} className="space-y-5">
            <div className="space-y-1.5">
              <Label htmlFor="key-name">Key Name</Label>
              <Input
                id="key-name"
                placeholder="e.g. Website Lead Form, Zapier, Cursor MCP"
                value={keyName}
                onChange={(e) => setKeyName(e.target.value)}
                maxLength={80}
                required
              />
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>Scopes & Permissions</Label>
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

              <div className="grid gap-2.5 rounded-xl border p-3.5 bg-muted/20">
                {ALL_SCOPES.map((scope) => {
                  const checked = selectedScopes.includes(scope);
                  return (
                    <label
                      key={scope}
                      className="flex items-start gap-2.5 cursor-pointer select-none group"
                    >
                      <Checkbox
                        checked={checked}
                        onCheckedChange={() => toggleScope(scope)}
                        className="mt-0.5"
                      />
                      <div className="space-y-0.5 leading-none">
                        <span className="font-mono text-xs font-medium text-foreground">
                          {scope}
                        </span>
                        <p className="text-[12px] text-muted-foreground">
                          {SCOPE_DESCRIPTIONS[scope]}
                        </p>
                      </div>
                    </label>
                  );
                })}
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
                {busy ? "Generating..." : "Generate Key"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* REVEAL KEY MODAL (SHOWN ONCE) */}
      <Dialog open={!!revealedKey} onOpenChange={(open) => !open && setRevealedKey(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-emerald-600">
              <Key className="h-5 w-5" />
              API Key Generated
            </DialogTitle>
            <DialogDescription>
              Copy your API key now. For your security, you will not be able to view it again.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="relative">
              <pre className="p-3 pr-12 rounded-xl bg-muted font-mono text-xs break-all border select-all">
                {revealedKey}
              </pre>
              <Button
                size="sm"
                variant="outline"
                className="absolute right-1.5 top-1.5 h-8 w-8 p-0"
                onClick={() => revealedKey && copyToClipboard(revealedKey)}
              >
                {copied ? <Check className="h-4 w-4 text-emerald-600" /> : <Copy className="h-4 w-4" />}
              </Button>
            </div>

            <div className="flex items-start gap-2 rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-700 dark:text-amber-400">
              <ShieldAlert className="h-4 w-4 shrink-0 mt-0.5" />
              <p>
                Store this key securely. If you lose it, you will need to revoke it and generate a new one.
              </p>
            </div>
          </div>

          <DialogFooter>
            <Button
              className="w-full"
              onClick={() => {
                setRevealedKey(null);
              }}
            >
              Done
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* REVOKE CONFIRMATION DIALOG */}
      <Dialog open={!!revokeTarget} onOpenChange={(open) => !open && setRevokeTarget(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="text-destructive">Revoke API Key</DialogTitle>
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
              {revoking ? "Revoking..." : "Revoke Key"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
