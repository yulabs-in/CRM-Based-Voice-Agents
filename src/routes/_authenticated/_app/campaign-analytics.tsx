import { createFileRoute } from "@tanstack/react-router";
import { AnalyticsPage } from "@/components/app/AnalyticsPage";
import { pageHead } from "@/lib/seo";

export const Route = createFileRoute("/_authenticated/_app/campaign-analytics")({
  head: () => pageHead("Campaign Analytics", "How each calling campaign is performing."),
  component: () => <AnalyticsPage kind="campaigns" title="Campaign Analytics" description="How each calling campaign is performing." />,
});
