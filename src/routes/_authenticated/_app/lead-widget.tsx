import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Check, Copy, Plus, RefreshCw, X } from "lucide-react";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { PageHeader } from "@/components/app/PageHeader";
import { supabase } from "@/lib/supabase";
import { isAdmin, useOrg } from "@/lib/org";
import { pageHead } from "@/lib/seo";
import { getWidgetSettings, regenerateWidgetKey, saveWidgetSettings } from "@/lib/widget.functions";
import { DEFAULT_APPEARANCE, DEFAULT_CALLING_HOURS } from "@/lib/widget";

export const Route = createFileRoute("/_authenticated/_app/lead-widget")({
  head: () => pageHead("Lead Widget", "Embeddable website lead-capture form with instant AI callback."),
  component: WidgetSettingsPage,
});

const NONE = "__none";

function WidgetSettingsPage() {
  const { org, role } = useOrg();
  const admin = isAdmin(role);
  const qc = useQueryClient();
  const fetchSettings = useServerFn(getWidgetSettings);
  const saveFn = useServerFn(saveWidgetSettings);
  const regenFn = useServerFn(regenerateWidgetKey);

  const settingsQuery = useQuery({
    queryKey: ["widget-settings", org.id],
    queryFn: () => fetchSettings({ data: { organizationId: org.id } }),
  });

  const projectsQuery = useQuery({
    queryKey: ["projects", org.id, "picker"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("projects")
        .select("id, name")
        .eq("organization_id", org.id)
        .eq("status", "active")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const agentsQuery = useQuery({
    queryKey: ["voice_agents", org.id, "picker"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("voice_agents")
        .select("id, name, status")
        .eq("organization_id", org.id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const [widgetKey, setWidgetKey] = useState("");
  const [allowedDomains, setAllowedDomains] = useState<string[]>([]);
  const [domainInput, setDomainInput] = useState("");
  const [projectId, setProjectId] = useState<string | null>(null);
  const [agentId, setAgentId] = useState<string | null>(null);
  const [instantCallback, setInstantCallback] = useState(false);
  const [callingHours, setCallingHours] = useState(DEFAULT_CALLING_HOURS);
  const [appearance, setAppearance] = useState(DEFAULT_APPEARANCE);
  const [privacyUrl, setPrivacyUrl] = useState("");
  const [embedMode, setEmbedMode] = useState<"inline" | "floating">("inline");
  const [copiedEmbed, setCopiedEmbed] = useState(false);

  useEffect(() => {
    const s = settingsQuery.data;
    if (!s) return;
    setWidgetKey(s.widget_key);
    setAllowedDomains(s.allowed_domains);
    setProjectId(s.project_id);
    setAgentId(s.agent_id);
    setInstantCallback(s.instant_callback);
    setCallingHours(s.calling_hours);
    setAppearance(s.appearance);
    setPrivacyUrl(s.privacy_url ?? "");
  }, [settingsQuery.data]);

  const save = useMutation({
    mutationFn: () =>
      saveFn({
        data: {
          organizationId: org.id,
          widget_key: widgetKey,
          allowed_domains: allowedDomains,
          project_id: projectId,
          agent_id: agentId,
          instant_callback: instantCallback,
          calling_hours: callingHours,
          appearance,
          privacy_url: privacyUrl.trim() || "",
        },
      }),
    onSuccess: () => {
      toast.success("Widget settings saved");
      void qc.invalidateQueries({ queryKey: ["widget-settings", org.id] });
    },
    onError: (err) => toast.error(err.message),
  });

  const regenerate = useMutation({
    mutationFn: () => regenFn({ data: { organizationId: org.id } }),
    onSuccess: (res) => {
      setWidgetKey(res.widget_key);
      toast.success("Widget key regenerated");
      void qc.invalidateQueries({ queryKey: ["widget-settings", org.id] });
    },
    onError: (err) => toast.error(err.message),
  });

  function addDomain() {
    const cleaned = domainInput
      .trim()
      .toLowerCase()
      .replace(/^https?:\/\//, "")
      .replace(/\/.*$/, "");
    if (!cleaned) return;
    if (!allowedDomains.includes(cleaned)) {
      setAllowedDomains([...allowedDomains, cleaned]);
    }
    setDomainInput("");
  }

  const origin = typeof window !== "undefined" ? window.location.origin : "https://yulabs-crm-1122.netlify.app";
  const embedSnippet = `<script src="${origin}/widget.js" data-key="${widgetKey || "wk_..."}" data-mode="${embedMode}" async></script>`;

  function copyEmbed() {
    void navigator.clipboard.writeText(embedSnippet);
    setCopiedEmbed(true);
    toast.success("Embed code copied");
    setTimeout(() => setCopiedEmbed(false), 2000);
  }

  return (
    <div className="animate-rise space-y-6">
      <PageHeader
        title="Website Lead Widget"
        description="Embed a lead-capture form on any website with optional instant AI callback."
      />

      <div className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            save.mutate();
          }}
          className="space-y-6 rounded-2xl border bg-card p-6 shadow-soft"
        >
          <div className="space-y-2">
            <Label htmlFor="widget-key">Widget key (public identifier)</Label>
            <div className="flex flex-wrap gap-2">
              <Input id="widget-key" readOnly value={widgetKey} className="flex-1 rounded-xl font-mono text-xs" />
              {admin && (
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button type="button" variant="outline" size="sm" disabled={regenerate.isPending}>
                      <RefreshCw className="size-4" /> Regenerate
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Regenerate widget key?</AlertDialogTitle>
                      <AlertDialogDescription>
                        Existing embeds stop working immediately until updated with the new key.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                      <AlertDialogAction onClick={() => regenerate.mutate()}>Regenerate</AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              )}
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="allowed-domain-input">Allowed domains</Label>
            <div className="flex gap-2">
              <Input
                id="allowed-domain-input"
                placeholder="example.com or localhost:5500"
                disabled={!admin}
                value={domainInput}
                onChange={(e) => setDomainInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    addDomain();
                  }
                }}
                className="rounded-xl"
              />
              <Button type="button" variant="outline" disabled={!admin} onClick={addDomain}>
                <Plus className="size-4" /> Add
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Submissions from other origins are rejected (403). Use <code>localhost:*</code> only while testing.
            </p>
            {allowedDomains.length > 0 && (
              <div className="flex flex-wrap gap-1.5 pt-1">
                {allowedDomains.map((d) => (
                  <span
                    key={d}
                    className="inline-flex items-center gap-1 rounded-lg border bg-muted/50 px-2.5 py-1 text-xs font-medium"
                  >
                    {d}
                    {admin && (
                      <button
                        type="button"
                        aria-label={`Remove ${d}`}
                        onClick={() => setAllowedDomains(allowedDomains.filter((item) => item !== d))}
                        className="text-muted-foreground hover:text-foreground"
                      >
                        <X className="size-3" />
                      </button>
                    )}
                  </span>
                ))}
              </div>
            )}
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="widget-project">Target project</Label>
              <Select
                disabled={!admin}
                value={projectId ?? NONE}
                onValueChange={(v) => setProjectId(v === NONE ? null : v)}
              >
                <SelectTrigger id="widget-project" className="rounded-xl">
                  <SelectValue placeholder="Choose project" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>No project</SelectItem>
                  {(projectsQuery.data ?? []).map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="widget-agent">Callback voice agent</Label>
              <Select
                disabled={!admin}
                value={agentId ?? NONE}
                onValueChange={(v) => setAgentId(v === NONE ? null : v)}
              >
                <SelectTrigger id="widget-agent" className="rounded-xl">
                  <SelectValue placeholder="Choose voice agent" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>No agent selected</SelectItem>
                  {(agentsQuery.data ?? []).map((a) => (
                    <SelectItem key={a.id} value={a.id}>
                      {a.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-4 rounded-xl border bg-muted/30 p-4">
            <div className="flex items-start justify-between gap-4">
              <div className="space-y-1">
                <Label htmlFor="instant-callback" className="font-medium">
                  Instant AI callback
                </Label>
                <p className="text-xs text-muted-foreground">
                  When enabled and the visitor ticks consent, the selected AI agent calls them within a minute (during calling hours).
                </p>
              </div>
              <Switch
                id="instant-callback"
                disabled={!admin}
                checked={instantCallback}
                onCheckedChange={setInstantCallback}
              />
            </div>

            <div className="grid gap-3 sm:grid-cols-3">
              <div className="space-y-1">
                <Label htmlFor="hours-start" className="text-xs">Start (IST)</Label>
                <Input
                  id="hours-start"
                  type="time"
                  disabled={!admin}
                  value={callingHours.start}
                  onChange={(e) => setCallingHours({ ...callingHours, start: e.target.value })}
                  className="rounded-xl"
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="hours-end" className="text-xs">End (IST)</Label>
                <Input
                  id="hours-end"
                  type="time"
                  disabled={!admin}
                  value={callingHours.end}
                  onChange={(e) => setCallingHours({ ...callingHours, end: e.target.value })}
                  className="rounded-xl"
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="hours-tz" className="text-xs">Timezone</Label>
                <Input
                  id="hours-tz"
                  disabled={!admin}
                  value={callingHours.tz}
                  onChange={(e) => setCallingHours({ ...callingHours, tz: e.target.value })}
                  className="rounded-xl"
                />
              </div>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="widget-title">Heading text</Label>
              <Input
                id="widget-title"
                disabled={!admin}
                value={appearance.title}
                onChange={(e) => setAppearance({ ...appearance, title: e.target.value })}
                className="rounded-xl"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="widget-button">Button text</Label>
              <Input
                id="widget-button"
                disabled={!admin}
                value={appearance.button}
                onChange={(e) => setAppearance({ ...appearance, button: e.target.value })}
                className="rounded-xl"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="widget-colour">Accent colour</Label>
              <div className="flex gap-2">
                <Input
                  id="widget-colour"
                  type="color"
                  disabled={!admin}
                  value={appearance.colour}
                  onChange={(e) => setAppearance({ ...appearance, colour: e.target.value })}
                  className="h-10 w-14 rounded-xl p-1"
                />
                <Input
                  aria-label="Accent colour hex"
                  disabled={!admin}
                  value={appearance.colour}
                  onChange={(e) => setAppearance({ ...appearance, colour: e.target.value })}
                  className="rounded-xl font-mono text-xs"
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="widget-privacy">Privacy policy URL</Label>
              <Input
                id="widget-privacy"
                type="url"
                disabled={!admin}
                placeholder="https://example.com/privacy"
                value={privacyUrl}
                onChange={(e) => setPrivacyUrl(e.target.value)}
                className="rounded-xl"
              />
            </div>
          </div>

          {admin && (
            <Button variant="hero" type="submit" disabled={save.isPending}>
              Save widget settings
            </Button>
          )}
        </form>

        <div className="space-y-6">
          <div className="rounded-2xl border bg-card p-6 shadow-soft space-y-3">
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-sm font-semibold">Embed code</h2>
              <div className="flex rounded-lg border bg-muted/40 p-0.5 text-xs">
                <button
                  type="button"
                  onClick={() => setEmbedMode("inline")}
                  className={`rounded-md px-2 py-1 ${embedMode === "inline" ? "bg-card font-medium shadow-soft" : "text-muted-foreground"}`}
                >
                  Inline
                </button>
                <button
                  type="button"
                  onClick={() => setEmbedMode("floating")}
                  className={`rounded-md px-2 py-1 ${embedMode === "floating" ? "bg-card font-medium shadow-soft" : "text-muted-foreground"}`}
                >
                  Floating
                </button>
              </div>
            </div>
            <pre className="overflow-x-auto rounded-xl border bg-muted/50 p-3 font-mono text-xs whitespace-pre-wrap break-all">
              {embedSnippet}
            </pre>
            <Button type="button" variant="outline" size="sm" onClick={copyEmbed}>
              {copiedEmbed ? <Check className="size-4" /> : <Copy className="size-4" />}
              Copy embed code
            </Button>
          </div>

          <div className="rounded-2xl border bg-card p-6 shadow-soft space-y-4">
            <h2 className="text-sm font-semibold">Live preview</h2>
            <div className="mx-auto max-w-sm rounded-2xl border bg-background p-5 shadow-soft space-y-3">
              <p className="text-base font-bold">{appearance.title || "Get a call back"}</p>
              <div className="space-y-1">
                <span className="block text-xs font-medium text-muted-foreground">Name *</span>
                <div className="h-9 rounded-lg border bg-card px-3 text-sm leading-9 text-muted-foreground">Your name</div>
              </div>
              <div className="space-y-1">
                <span className="block text-xs font-medium text-muted-foreground">Mobile number *</span>
                <div className="h-9 rounded-lg border bg-card px-3 text-sm leading-9 text-muted-foreground">+91 98765 43210</div>
              </div>
              <div className="space-y-1">
                <span className="block text-xs font-medium text-muted-foreground">Interest (optional)</span>
                <div className="h-9 rounded-lg border bg-card px-3 text-sm leading-9 text-muted-foreground">e.g. Health insurance</div>
              </div>
              <p className="text-xs text-muted-foreground leading-relaxed">
                ☐ I agree to receive a call from {org.name} about my enquiry.
                {privacyUrl ? <span className="underline ml-1" style={{ color: appearance.colour }}>Privacy policy</span> : null}
              </p>
              <button
                type="button"
                className="w-full rounded-xl py-2.5 text-sm font-semibold text-white"
                style={{ backgroundColor: appearance.colour || "#6d28d9" }}
              >
                {appearance.button || "Call me"}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
