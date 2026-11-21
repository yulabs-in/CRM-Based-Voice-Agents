import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import { Logo } from "@/components/app/Logo";

export const Route = createFileRoute("/_authenticated/invite/$token")({
  head: () => ({
    meta: [
      { title: "Join workspace — Yulabs CRM" },
      { name: "description", content: "Accept your invitation to a Yulabs CRM workspace." },
      { property: "og:title", content: "Join workspace — Yulabs CRM" },
      { property: "og:description", content: "Accept your invitation to a Yulabs CRM workspace." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Invite,
});

function Invite() {
  const { token } = Route.useParams();
  const { user } = Route.useRouteContext();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);
  async function accept() {
    setBusy(true);
    const { data, error } = await supabase.rpc("accept_invitation", { _token: token });
    setBusy(false);
    if (error) { toast.error("This invitation is invalid, already used, or for a different email."); return; }
    localStorage.setItem("yulabs.org", String(data));
    await qc.invalidateQueries({ queryKey: ["memberships"] });
    navigate({ to: "/dashboard" });
  }
  return (
    <div className="dot-canvas grid min-h-screen place-items-center px-4">
      <div className="w-full max-w-md rounded-3xl border bg-card p-8 text-center shadow-float">
        <div className="flex justify-center"><Logo /></div>
        <h1 className="mt-6 text-2xl font-bold">You've been invited</h1>
        <p className="mt-2 text-sm text-muted-foreground">Join as <span className="font-semibold text-foreground">{user.email}</span>.</p>
        <Button variant="hero" size="lg" className="mt-6 w-full" disabled={busy} onClick={accept}>{busy && <Loader2 className="animate-spin" />} Accept invitation</Button>
      </div>
    </div>
  );
}
