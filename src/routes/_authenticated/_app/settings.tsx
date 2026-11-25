import { createFileRoute, Link } from "@tanstack/react-router";
import { useState, type FormEvent } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Bot, Code2 } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PageHeader } from "@/components/app/PageHeader";
import { isAdmin, useOrg } from "@/lib/org";

export const Route = createFileRoute("/_authenticated/_app/settings")({
  head: () => ({
    meta: [
      { title: "Settings — Yulabs CRM" },
      { name: "description", content: "Organization details and workspace preferences." },
      { property: "og:title", content: "Settings — Yulabs CRM" },
      { property: "og:description", content: "Organization details and workspace preferences." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Settings,
});

const FIELDS = [["name", "Organization name"], ["website", "Website"], ["phone", "Phone"], ["industry", "Industry"], ["business_type", "Business type"], ["country", "Country"], ["timezone", "Timezone"]] as const;

function Settings() {
  const { org, role } = useOrg();
  const qc = useQueryClient();
  const admin = isAdmin(role);
  const [f, setF] = useState(() => Object.fromEntries(FIELDS.map(([k]) => [k, org[k] ?? ""])) as Record<string, string>);
  const [busy, setBusy] = useState(false);
  async function save(e: FormEvent) {
    e.preventDefault(); setBusy(true);
    const { error } = await supabase.from("organizations").update(f as Record<(typeof FIELDS)[number][0], string>).eq("id", org.id);
    setBusy(false);
    if (error) { toast.error(error.message); return; }
    toast.success("Settings saved");
    qc.invalidateQueries({ queryKey: ["memberships"] });
  }
  return (
    <div className="animate-rise space-y-6">
      <PageHeader
        title="Settings"
        description="Manage your organization profile and workspace preferences."
      />
      <form onSubmit={save} className="max-w-2xl rounded-2xl border bg-card p-6 shadow-soft">
        <div className="grid gap-4 sm:grid-cols-2">
          {FIELDS.map(([k, l]) => (
            <div key={k} className="space-y-1.5">
              <Label htmlFor={k}>{l}</Label>
              <Input
                id={k}
                disabled={!admin}
                value={f[k]}
                onChange={(e) => setF({ ...f, [k]: e.target.value })}
                className="rounded-xl"
              />
            </div>
          ))}
        </div>
        {admin && (
          <Button variant="hero" className="mt-6" disabled={busy}>
            Save changes
          </Button>
        )}
      </form>

      {admin && (
        <div className="max-w-2xl rounded-2xl border bg-card p-6 shadow-soft flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-base font-semibold">Developer access</h2>
            <p className="text-sm text-muted-foreground">
              Manage REST API keys and MCP server keys for external apps and AI assistants.
            </p>
          </div>
          <div className="flex flex-wrap gap-2 shrink-0">
            <Button variant="outline" size="sm" asChild className="gap-1.5">
              <Link to="/developers/api">
                <Code2 className="h-4 w-4" />
                API
              </Link>
            </Button>
            <Button variant="outline" size="sm" asChild className="gap-1.5">
              <Link to="/developers/mcp">
                <Bot className="h-4 w-4" />
                MCP
              </Link>
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
