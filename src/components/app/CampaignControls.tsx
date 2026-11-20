import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Clock, Loader2, Pause, Play, Rocket, Square } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useOrg } from "@/lib/org";
import { launchCampaign, setCampaignStatus, updateCampaignSchedule } from "@/lib/campaigns.functions";

const CAMPAIGN_ROLES = ["owner", "admin", "sales_manager", "voice_manager"];
const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"] as const;
type Day = (typeof DAYS)[number];

export type ControllableCampaign = {
  id: string; name: string; status: string; consent_confirmed?: boolean;
  allowed_start_time?: string; allowed_end_time?: string; allowed_days?: string[]; timezone?: string;
};

/** Is "now" outside the campaign's calling window? (Sarvam silently waits until the window opens.) */
export function outsideCallingHours(campaign: ControllableCampaign, now = new Date()): boolean {
  if (!campaign.allowed_start_time || !campaign.allowed_end_time) return false;
  const tz = campaign.timezone || "Asia/Kolkata";
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone: tz, weekday: "long", hour: "2-digit", minute: "2-digit", hour12: false }).formatToParts(now);
  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? "";
  const time = `${get("hour").replace("24", "00")}:${get("minute")}`;
  const dayOk = !campaign.allowed_days?.length || campaign.allowed_days.includes(get("weekday"));
  return !dayOk || time < campaign.allowed_start_time || time >= campaign.allowed_end_time;
}

/** Launch / Pause / Resume / Stop / Edit calling hours for one campaign. `compact` = icon buttons for table rows. */
export function CampaignControls({ campaign, compact = false }: { campaign: ControllableCampaign; compact?: boolean }) {
  const { role } = useOrg();
  const qc = useQueryClient();
  const launch = useServerFn(launchCampaign);
  const control = useServerFn(setCampaignStatus);
  const reschedule = useServerFn(updateCampaignSchedule);
  const [editing, setEditing] = useState(false);
  const [hours, setHours] = useState({
    start: campaign.allowed_start_time ?? "09:00",
    end: campaign.allowed_end_time ?? "21:00",
    days: (campaign.allowed_days ?? DAYS.slice(0, 6)) as Day[],
    timezone: campaign.timezone ?? "Asia/Kolkata",
  });

  const act = useMutation({
    mutationFn: async (action: "launch" | "pause" | "resume" | "cancel") => {
      if (action === "launch") return launch({ data: { campaignId: campaign.id } }).then((result) => `Launched — ${result.contacts.toLocaleString()} contacts sent to Sarvam`);
      return control({ data: { campaignId: campaign.id, action } }).then((result) => (action === "cancel" ? "Campaign stopped" : `Campaign ${result.status}`));
    },
    onSuccess: (text) => toast.success(text),
    onError: (error) => toast.error(error.message),
    onSettled: () => { void qc.invalidateQueries({ queryKey: ["campaigns"] }); void qc.invalidateQueries({ queryKey: ["live"] }); },
  });
  const saveHours = useMutation({
    mutationFn: () => reschedule({ data: { campaignId: campaign.id, allowedStartTime: hours.start, allowedEndTime: hours.end, allowedDays: hours.days, timezone: hours.timezone } }),
    onSuccess: () => { toast.success(`Calling hours updated to ${hours.start}–${hours.end}`); setEditing(false); },
    onError: (error) => toast.error(error.message),
    onSettled: () => { void qc.invalidateQueries({ queryKey: ["campaigns"] }); void qc.invalidateQueries({ queryKey: ["live"] }); },
  });

  if (!CAMPAIGN_ROLES.includes(role)) return null;
  const s = campaign.status;
  const live = ["running", "scheduled", "launching"].includes(s);
  const size = compact ? "icon" : "sm";
  const busy = act.isPending || saveHours.isPending;
  const spin = (action: string) => act.isPending && act.variables === action;

  return (
    <div className="flex flex-wrap items-center gap-1.5" onClick={(event) => event.stopPropagation()}>
      {["draft", "failed"].includes(s) && (
        <Button size={size} variant="hero" disabled={busy || campaign.consent_confirmed === false} onClick={() => act.mutate("launch")} aria-label="Launch campaign" title={campaign.consent_confirmed === false ? "Saved without consent — create a new campaign" : "Launch"}>
          {spin("launch") ? <Loader2 className="animate-spin" /> : <Rocket />}{!compact && "Launch"}
        </Button>
      )}
      {live && (
        <Button size={size} variant="outline" disabled={busy} onClick={() => act.mutate("pause")} aria-label="Pause campaign" title="Pause">
          {spin("pause") ? <Loader2 className="animate-spin" /> : <Pause />}{!compact && "Pause"}
        </Button>
      )}
      {s === "paused" && (
        <Button size={size} variant="outline" disabled={busy} onClick={() => act.mutate("resume")} aria-label="Continue campaign" title="Continue">
          {spin("resume") ? <Loader2 className="animate-spin" /> : <Play />}{!compact && "Continue"}
        </Button>
      )}
      {(live || s === "paused") && (
        <>
          <Button size={size} variant="outline" disabled={busy} onClick={() => setEditing(true)} aria-label="Edit calling hours" title="Edit calling hours">
            <Clock />{!compact && "Calling hours"}
          </Button>
          <Button size={size} variant="ghost" className="text-destructive" disabled={busy} aria-label="Stop campaign" title="Stop"
            onClick={() => confirm(`Stop "${campaign.name}"? Contacts not yet called will be skipped. This can't be undone.`) && act.mutate("cancel")}>
            {spin("cancel") ? <Loader2 className="animate-spin" /> : <Square />}{!compact && "Stop"}
          </Button>
        </>
      )}

      <Dialog open={editing} onOpenChange={(open) => !saveHours.isPending && setEditing(open)}>
        <DialogContent className="max-w-[calc(100vw-1.5rem)] rounded-2xl sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Calling hours · {campaign.name}</DialogTitle>
            <DialogDescription>Sarvam only dials inside this window. A running campaign is briefly paused while the change is saved.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5"><Label htmlFor={`from-${campaign.id}`}>From</Label><Input id={`from-${campaign.id}`} type="time" value={hours.start} onChange={(event) => setHours((h) => ({ ...h, start: event.target.value }))} className="rounded-xl" /></div>
              <div className="space-y-1.5"><Label htmlFor={`to-${campaign.id}`}>To</Label><Input id={`to-${campaign.id}`} type="time" value={hours.end} onChange={(event) => setHours((h) => ({ ...h, end: event.target.value }))} className="rounded-xl" /></div>
            </div>
            <div className="flex flex-wrap gap-3">
              {DAYS.map((day) => (
                <label key={day} className="flex items-center gap-1.5 text-sm">
                  <Checkbox checked={hours.days.includes(day)} onCheckedChange={(checked) => setHours((h) => ({ ...h, days: checked ? [...h.days, day] : h.days.filter((item) => item !== day) }))} />
                  {day.slice(0, 3)}
                </label>
              ))}
            </div>
            <div className="space-y-1.5"><Label htmlFor={`tz-${campaign.id}`}>Timezone</Label><Input id={`tz-${campaign.id}`} value={hours.timezone} onChange={(event) => setHours((h) => ({ ...h, timezone: event.target.value }))} className="rounded-xl" /></div>
            {hours.start >= hours.end && <p className="text-xs text-destructive">"From" must be before "To".</p>}
            <p className="text-xs text-muted-foreground">For real customers, keep promotional calls within 9:00 AM–9:00 PM (TRAI).</p>
          </div>
          <DialogFooter>
            <Button variant="ghost" disabled={saveHours.isPending} onClick={() => setEditing(false)}>Cancel</Button>
            <Button variant="hero" disabled={saveHours.isPending || hours.start >= hours.end || !hours.days.length} onClick={() => saveHours.mutate()}>
              {saveHours.isPending && <Loader2 className="animate-spin" />} Save hours
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
