import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { Bot, Lock, ShieldCheck } from "lucide-react";
import { EntityPage, type Row } from "@/components/app/EntityPage";
import { StatusBadge } from "@/components/app/StatusBadge";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { shortDate } from "@/lib/format";
import { useOrg } from "@/lib/org";
import { pageHead } from "@/lib/seo";
import { KYC_STATUSES } from "@/lib/sales-ops";
import { isSalesRole } from "@/lib/sales-data";

export const Route = createFileRoute("/_authenticated/_app/kyc")({
  validateSearch: (s: Record<string, unknown>): { new?: boolean } => ({ new: s.new === true || s.new === "true" ? true : undefined }),
  head: () => pageHead("Client KYC", "KYC details collected on AI calls and by your team."),
  component: Page,
});

const TABS = [
  { value: "collected", label: "Needs review" }, { value: "pending", label: "Pending" }, { value: "verified", label: "Verified" }, { value: "all", label: "All" },
];
const YES_NO = [{ value: "true", label: "Yes, the client agreed" }, { value: "false", label: "No / not asked" }];

function Page() {
  const s = Route.useSearch();
  const nav = useNavigate();
  const { role } = useOrg();
  const [tab, setTab] = useState("collected");

  if (!isSalesRole(role)) {
    return (
      <div className="animate-rise mx-auto max-w-lg rounded-2xl border bg-card p-8 text-center shadow-soft">
        <span className="mx-auto grid size-12 place-items-center rounded-2xl bg-accent text-accent-foreground"><Lock /></span>
        <p className="mt-4 font-semibold">KYC is limited to the sales team</p>
        <p className="mt-1 text-sm text-muted-foreground">Client KYC holds personal details, so only owners, admins, sales managers, team leads and sales representatives can see it.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-start gap-3 rounded-2xl border bg-accent/40 p-4 text-sm">
        <ShieldCheck className="mt-0.5 size-5 shrink-0 text-primary" />
        <p className="text-muted-foreground">
          The AI agent only takes KYC after the client agrees on the call. It never asks for Aadhaar, OTPs, bank or card details, and only a masked PAN is stored.
          Check each record against the client's ID, then edit it and set <span className="font-semibold text-foreground">Status → Verified</span>. Verified records are never overwritten by later calls.
        </p>
      </div>
      <EntityPage table="client_kyc" title="Client KYC" singular="KYC record" icon={ShieldCheck}
        description="Personal details collected on AI calls (with consent) and by your team."
        openNew={s.new} onCloseNew={() => nav({ to: "/kyc", search: {} })}
        order="updated_at"
        searchKeys={["full_name", "email", "city", "pincode", "nominee_name"]}
        rowFilter={(r: Row) => tab === "all" || r.status === tab}
        toolbar={<Tabs value={tab} onValueChange={setTab}><TabsList>{TABS.map((t) => <TabsTrigger key={t.value} value={t.value}>{t.label}</TabsTrigger>)}</TabsList></Tabs>}
        emptyHint="KYC records are created when a client shares details on an AI call, or add one yourself."
        fields={[
          { key: "contact_id", label: "Client", type: "ref", refTable: "contacts", required: true, full: true },
          { key: "full_name", label: "Full name (as on ID)" }, { key: "date_of_birth", label: "Date of birth", type: "date" },
          { key: "email", label: "Email", type: "email" }, { key: "pincode", label: "Pincode" },
          { key: "address_line", label: "Address", full: true },
          { key: "city", label: "City" }, { key: "state", label: "State" },
          { key: "nominee_name", label: "Nominee name" }, { key: "nominee_relation", label: "Nominee relation" },
          { key: "consent_given", label: "Consent to store KYC", type: "select", options: YES_NO },
          { key: "status", label: "Status", type: "select", options: KYC_STATUSES },
          { key: "notes", label: "Notes", type: "textarea" },
        ]}
        defaults={{ status: "pending", consent_given: "false" }}
        columns={[
          { key: "contact_id", label: "Client", render: (r, refs) => (
            <span className="inline-flex items-center gap-1.5 font-semibold">{refs.contacts?.get(String(r.contact_id)) ?? "—"}{r.source === "ai_call" && <Bot className="size-3.5 text-primary" aria-label="From AI call" />}</span>
          ) },
          { key: "full_name", label: "Name on ID", render: (r) => String(r.full_name ?? "—") },
          { key: "date_of_birth", label: "Date of birth", render: (r) => shortDate(r.date_of_birth) },
          { key: "email", label: "Email", render: (r) => String(r.email ?? "—") },
          { key: "pincode", label: "City / pincode", render: (r) => [r.city, r.pincode].filter(Boolean).join(" · ") || "—" },
          { key: "nominee_name", label: "Nominee", render: (r) => r.nominee_name ? `${r.nominee_name}${r.nominee_relation ? ` (${r.nominee_relation})` : ""}` : "—" },
          { key: "pan_masked", label: "PAN", render: (r) => <span className="font-mono text-xs">{String(r.pan_masked ?? "—")}</span> },
          { key: "status", label: "Status", render: (r) => <StatusBadge value={r.status} /> },
          { key: "updated_at", label: "Updated", render: (r) => shortDate(r.updated_at) },
        ]}
      />
    </div>
  );
}
