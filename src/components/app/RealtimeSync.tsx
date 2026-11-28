import { useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useOrg } from "@/lib/org";
import { CALLS_CHANGED_EVENT } from "./RecordingAutoFetch";

/** Which cached queries each table feeds. Invalidating only refetches queries that are on screen. */
const QUERIES_BY_TABLE: Record<string, string[]> = {
  calls: ["calls", "live", "stats", "timeline", "campaigns", "meetings"],
  leads: ["leads", "stats", "timeline", "refs"],
  deals: ["deals", "stats", "timeline", "refs"],
  contacts: ["contacts", "refs", "projects"],
  tasks: ["tasks", "stats", "timeline"],
  meetings: ["meetings", "timeline"],
  call_campaigns: ["campaigns", "live", "stats"],
  campaign_targets: ["campaigns", "live"],
  sales_orders: ["sales_orders", "sales", "stats"],
  payments: ["payments", "sales_orders", "sales", "stats"],
  client_kyc: ["client_kyc", "sales"],
  dnc_numbers: ["dnc", "contacts"],
  compliance_log: ["dnc"],
};

/**
 * Live updates: listens to Supabase Realtime row changes for this workspace and refreshes the matching
 * screens immediately — no page reload or cache clearing. Bursts are batched into one refresh.
 */
export function RealtimeSync() {
  const { org } = useOrg();
  const qc = useQueryClient();
  const qcRef = useRef(qc);
  qcRef.current = qc;

  useEffect(() => {
    const pending = new Set<string>();
    let flush: ReturnType<typeof setTimeout> | undefined;
    const queue = (table: string) => {
      for (const key of QUERIES_BY_TABLE[table] ?? [table]) pending.add(key);
      clearTimeout(flush);
      flush = setTimeout(() => {
        for (const key of pending) void qcRef.current.invalidateQueries({ queryKey: [key] });
        pending.clear();
      }, 250);
    };

    let channel = supabase.channel(`org-${org.id}-changes`);
    for (const table of Object.keys(QUERIES_BY_TABLE)) {
      channel = channel.on(
        "postgres_changes" as never,
        { event: "*", schema: "public", table, filter: `organization_id=eq.${org.id}` } as never,
        ((payload: { eventType?: string }) => {
          queue(table);
          if (table === "calls" && payload.eventType === "INSERT") window.dispatchEvent(new Event(CALLS_CHANGED_EVENT));
        }) as never,
      );
    }
    channel.subscribe();
    return () => {
      clearTimeout(flush);
      void supabase.removeChannel(channel);
    };
  }, [org.id]);

  return null;
}
