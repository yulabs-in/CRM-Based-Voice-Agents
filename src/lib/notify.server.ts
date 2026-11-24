import { supabaseAdmin } from "@/lib/supabase-admin.server";

export type NotificationEvent =
  | "lead.interested"
  | "consultation.booked"
  | "call.escalated"
  | "contact.do_not_contact";

export interface RecipientContext {
  dealOwnerId?: string | null;
  assigneeId?: string | null;
}

export interface NotifyOptions {
  orgId: string;
  type: string;
  title: string;
  body?: string | null;
  link?: string | null;
  priority?: "normal" | "high";
  recipients: string[];
  dedupeKey?: string | null;
}

/**
 * Computes recipient user IDs based on workspace membership and role.
 * - lead.interested, consultation.booked: deal owner if set, else owner/admin/sales_manager
 * - call.escalated: owner/admin/sales_manager (always), plus deal owner if set
 * - contact.do_not_contact: owner/admin
 */
export async function recipientsFor(
  orgId: string,
  event: NotificationEvent,
  context: RecipientContext = {}
): Promise<string[]> {
  try {
    const { data: members, error } = await supabaseAdmin
      .from("memberships")
      .select("user_id, role")
      .eq("organization_id", orgId);

    if (error || !members) return [];

    const recipientSet = new Set<string>();

    if (event === "lead.interested" || event === "consultation.booked") {
      if (context.dealOwnerId) {
        if (members.some((m) => m.user_id === context.dealOwnerId)) {
          recipientSet.add(context.dealOwnerId);
        }
      } else {
        for (const m of members) {
          if (["owner", "admin", "sales_manager"].includes(m.role)) {
            recipientSet.add(m.user_id);
          }
        }
      }
    } else if (event === "call.escalated") {
      for (const m of members) {
        if (["owner", "admin", "sales_manager"].includes(m.role)) {
          recipientSet.add(m.user_id);
        }
      }
      if (context.dealOwnerId && members.some((m) => m.user_id === context.dealOwnerId)) {
        recipientSet.add(context.dealOwnerId);
      }
    } else if (event === "contact.do_not_contact") {
      for (const m of members) {
        if (["owner", "admin"].includes(m.role)) {
          recipientSet.add(m.user_id);
        }
      }
    }

    return Array.from(recipientSet);
  } catch (err) {
    console.warn("[notify] Error calculating recipientsFor:", err);
    return [];
  }
}

/**
 * Creates notifications for recipients.
 * Never throws an error — safe to call from background syncing without risking call processing failure.
 */
export async function notify(options: NotifyOptions): Promise<void> {
  try {
    if (!options.recipients || options.recipients.length === 0) return;

    const dedupe = options.dedupeKey
      ? `${options.type}:${options.dedupeKey}`
      : null;

    const rows = options.recipients.map((userId) => ({
      organization_id: options.orgId,
      user_id: userId,
      type: options.type,
      title: options.title,
      body: options.body ?? null,
      link: options.link ?? null,
      priority: options.priority ?? "normal",
      dedupe_key: dedupe,
    }));

    const { error } = await supabaseAdmin.from("notifications").upsert(rows, {
      onConflict: "user_id, dedupe_key",
      ignoreDuplicates: true,
    });

    if (error) {
      console.warn("[notify] Failed to insert notifications:", error.message);
    }
  } catch (err) {
    // Rule: Never throw out of notify(). A notification failure must not break the CRM sync.
    console.warn("[notify] Unexpected exception in notify():", err);
  }
}
