import { useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { canWrite, useOrg } from "@/lib/org";
import { fetchMissingCallRecordings } from "@/lib/recordings.functions";

const EVERY_MS = 60_000;

/** While the app is open, saves Sarvam recordings that weren't ready when a call ended (renders nothing). */
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
    const run = async () => {
      if (running || stopped || document.visibilityState === "hidden") return;
      running = true;
      try {
        const result = await latest.current.sweep({ data: { organizationId: org.id } });
        if (result.saved > 0 && !stopped) void latest.current.qc.invalidateQueries({ queryKey: ["calls"] });
      } catch {
        // Best effort — the next run will try again.
      } finally {
        running = false;
      }
    };
    const first = setTimeout(run, 5_000);
    const timer = setInterval(run, EVERY_MS);
    return () => { stopped = true; clearTimeout(first); clearInterval(timer); };
  }, [org.id, role]);

  return null;
}
