import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, OctagonX, Square } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useOrg } from "@/lib/org";
import { stopAllCalls, stopCall } from "@/lib/live-calls.functions";

const NOTE = "Sarvam can't hang up a call that is already connected — it ends on its own within the agent's call limit. Stopping cancels anything still waiting to dial and closes the call here.";

/** Stop one live call (and optionally its whole campaign). */
export function StopCallButton({ callId, campaignName }: { callId: string; campaignName?: string | null }) {
  const qc = useQueryClient();
  const stop = useServerFn(stopCall);
  const [open, setOpen] = useState(false);
  const [wholeCampaign, setWholeCampaign] = useState(false);
  const run = useMutation({
    mutationFn: () => stop({ data: { callId, stopCampaign: wholeCampaign } }),
    onSuccess: (result) => {
      toast.success(result.campaignCancelled ? "Call stopped and campaign cancelled" : "Call stopped");
      setOpen(false);
      void qc.invalidateQueries();
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "Could not stop the call"),
  });
  return (
    <>
      <Button size="sm" variant="outline" className="h-7 gap-1 border-destructive/40 px-2 text-destructive hover:bg-destructive/10" onClick={() => setOpen(true)}>
        <Square className="size-3 fill-current" /> Stop
      </Button>
      <AlertDialog open={open} onOpenChange={setOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Stop this call?</AlertDialogTitle>
            <AlertDialogDescription>{NOTE}</AlertDialogDescription>
          </AlertDialogHeader>
          {campaignName && (
            <div className="flex items-center gap-2">
              <Checkbox id={`stop-campaign-${callId}`} checked={wholeCampaign} onCheckedChange={(value) => setWholeCampaign(value === true)} />
              <Label htmlFor={`stop-campaign-${callId}`} className="text-sm">Also cancel the whole campaign “{campaignName}”</Label>
            </div>
          )}
          <AlertDialogFooter>
            <AlertDialogCancel>Keep calling</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90" disabled={run.isPending}
              onClick={(event) => { event.preventDefault(); run.mutate(); }}>
              {run.isPending && <Loader2 className="animate-spin" />} Stop call
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

/** Emergency stop for the whole workspace. */
export function StopAllCallsButton() {
  const { org } = useOrg();
  const qc = useQueryClient();
  const stopAll = useServerFn(stopAllCalls);
  const [open, setOpen] = useState(false);
  const run = useMutation({
    mutationFn: () => stopAll({ data: { organizationId: org.id } }),
    onSuccess: (result) => {
      if (result.errors.length) toast.error(`Some campaigns could not be cancelled: ${result.errors[0]}`);
      else toast.success(`Stopped: ${result.campaignsCancelled} campaign(s) cancelled, ${result.callsClosed} call(s) closed`);
      setOpen(false);
      void qc.invalidateQueries();
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "Could not stop calls"),
  });
  return (
    <>
      <Button size="sm" variant="destructive" className="gap-1.5" onClick={() => setOpen(true)}><OctagonX className="size-4" /> Stop all calls</Button>
      <AlertDialog open={open} onOpenChange={setOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Stop every call in this workspace?</AlertDialogTitle>
            <AlertDialogDescription>All running, scheduled and paused campaigns are cancelled on Sarvam (this can't be undone — you'd create a new campaign), and every open call is closed. {NOTE}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90" disabled={run.isPending}
              onClick={(event) => { event.preventDefault(); run.mutate(); }}>
              {run.isPending && <Loader2 className="animate-spin" />} Stop all calls
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
