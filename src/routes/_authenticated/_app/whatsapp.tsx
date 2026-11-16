import { createFileRoute } from "@tanstack/react-router";
import { MessageCircle } from "lucide-react";
import { EntityPage } from "@/components/app/EntityPage";
import { StatusBadge } from "@/components/app/StatusBadge";
import { pageHead, opts, fmtDuration } from "@/lib/seo";
import { shortDate } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/_app/whatsapp")({
  head: () => pageHead("WhatsApp", "Log and draft WhatsApp conversations with customers."),
  component: Page,
});

function Page() {
  void StatusBadge; void opts; void fmtDuration; void shortDate;
  return (
    <EntityPage table="messages" filter={{ channel: "whatsapp" }} title="WhatsApp" singular="Message" icon={MessageCircle} description="Log and draft WhatsApp conversations with your customers."
      searchKeys={["recipient", "subject", "body"]}
      fields={[
        { key: "recipient", label: "Phone number", required: true }, { key: "contact_id", label: "Contact", type: "ref", refTable: "contacts" },
        
        { key: "direction", label: "Direction", type: "select", options: opts(["outbound", "inbound"]) },
        { key: "status", label: "Status", type: "select", options: opts(["draft", "sent", "delivered", "read", "replied", "failed"]) },
        { key: "body", label: "Message", type: "textarea", full: true },
      ]}
      defaults={{ direction: "outbound", status: "draft" }}
      columns={[
        { key: "recipient", label: "To / from", render: (r) => <span className="font-semibold">{String(r.recipient)}</span> },
        { key: "body", label: "Message", className: "px-4 py-3 max-w-md", render: (r) => <p className="line-clamp-2 text-xs text-muted-foreground">{String(r.subject ? r.subject + " — " : "") + String(r.body ?? "")}</p> },
        { key: "direction", label: "Direction", render: (r) => <StatusBadge value={r.direction} /> },
        { key: "status", label: "Status", render: (r) => <StatusBadge value={r.status} /> },
        { key: "created_at", label: "Date", render: (r) => shortDate(r.created_at) },
      ]}
    />
  );
}
