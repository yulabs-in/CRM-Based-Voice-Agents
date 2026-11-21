import { useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { canWrite, useOrg } from "@/lib/org";
import { fetchMissingCallRecordings } from "@/lib/recordings.functions";

/** Poll fast while a call is live, slowly otherwise. */
const LIVE_MS = 5_000;
const IDLE_MS = 20_000;
/** Fired by RealtimeSync when a call row is inserted/changed, so a fresh call is picked up at once. */
export const CALLS_CHANGED_EVENT = "crm:calls-changed";

/**
 * While the app is open: pulls call results from Sarvam (status, transcript, answers) for calls whose
 * webhook hasn't arrived, applies outcomes to leads/deals, and saves late recordings (renders nothing).
 */
export function RecordingAutoFetch() {
  const { org, role } = useOrg();
  const qc = useQueryClient();
  const sweep = useServerFn(fetchMissingCallRecordings);
  // Keep the latest handles in a ref so re-renders don't restart the timer.
  const latest = useRef({ sweep, qc });
  latest.current = { sweep, qc };

  useEffect(() => {
    if (!canWrite(role)) return;
    let stopped = false;
    let running = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let delay = IDLE_MS;

    const schedule = (ms: number) => {
      if (stopped) return;
      clearTimeout(timer);
      timer = setTimeout(run, ms);
    };
    const run = async () => {
      if (stopped) return;
      if (running || document.visibilityState === "hidden") return schedule(delay);
      running = true;
      try {
        const result = await latest.current.sweep({ data: { organizationId: org.id } });
        delay = result.open > 0 ? LIVE_MS : IDLE_MS;
        if (!stopped && (result.saved > 0 || result.synced > 0 || result.crm > 0)) {
          // Realtime usually got there first; this covers a dropped socket.
          for (const key of ["calls", "live", "leads", "deals", "contacts", "tasks", "stats", "timeline"]) {
            void latest.current.qc.invalidateQueries({ queryKey: [key] });
          }
        }
      } catch {
        // Best effort — the next run will try again.
      } finally {
        running = false;
        schedule(delay);
      }
    };
    const onCallsChanged = () => { delay = LIVE_MS; schedule(1_500); };
    const onVisible = () => { if (document.visibilityState === "visible") schedule(500); };

    window.addEventListener(CALLS_CHANGED_EVENT, onCallsChanged);
    document.addEventListener("visibilitychange", onVisible);
    schedule(3_000);
    return () => {
      stopped = true;
      clearTimeout(timer);
      window.removeEventListener(CALLS_CHANGED_EVENT, onCallsChanged);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [org.id, role]);

  return null;
}
