import { createFileRoute } from "@tanstack/react-router";
import { AnalyticsPage } from "@/components/app/AnalyticsPage";
import { pageHead } from "@/lib/seo";

export const Route = createFileRoute("/_authenticated/_app/team-performance")({
  head: () => pageHead("Team Performance", "Who is closing deals and finishing tasks."),
  component: () => <AnalyticsPage kind="team" title="Team Performance" description="Who is closing deals and finishing tasks." />,
});
