import { AlertTriangle, Bell, CalendarCheck, PhoneOff, UserPlus, type LucideIcon } from "lucide-react";

export interface NotificationItem {
  id: string;
  organization_id: string;
  user_id: string;
  type: string;
  title: string;
  body: string | null;
  link: string | null;
  priority: "normal" | "high";
  dedupe_key: string | null;
  read_at: string | null;
  created_at: string;
}

export const NOTIFICATION_TYPE_META: Record<
  string,
  { label: string; icon: LucideIcon; iconClass: string }
> = {
  "lead.interested": {
    label: "Interested lead",
    icon: UserPlus,
    iconClass: "text-emerald-600 dark:text-emerald-400",
  },
  "consultation.booked": {
    label: "Consultation",
    icon: CalendarCheck,
    iconClass: "text-primary",
  },
  "call.escalated": {
    label: "Escalation",
    icon: AlertTriangle,
    iconClass: "text-destructive",
  },
  "contact.do_not_contact": {
    label: "Do not contact",
    icon: PhoneOff,
    iconClass: "text-muted-foreground",
  },
};

export function getNotificationMeta(type: string) {
  return (
    NOTIFICATION_TYPE_META[type] ?? {
      label: type,
      icon: Bell,
      iconClass: "text-muted-foreground",
    }
  );
}

/**
 * Splits a stored link (e.g. "/leads?contact=abc") into TanStack Router's `{ to, search }`
 * so query strings are never treated as part of the pathname.
 */
export function parseNotificationLink(link: string): {
  to: string;
  search?: Record<string, string>;
} {
  const idx = link.indexOf("?");
  if (idx === -1) return { to: link };
  const to = link.slice(0, idx) || "/";
  const params = new URLSearchParams(link.slice(idx + 1));
  const search: Record<string, string> = {};
  params.forEach((value, key) => {
    search[key] = value;
  });
  return Object.keys(search).length > 0 ? { to, search } : { to };
}

export function formatRelativeTime(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  if (diff < 0) return "just now";
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(dateStr).toLocaleDateString();
}
