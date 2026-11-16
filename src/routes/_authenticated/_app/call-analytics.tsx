import { createFileRoute } from "@tanstack/react-router";
import { AnalyticsPage } from "@/components/app/AnalyticsPage";
import { pageHead } from "@/lib/seo";

export const Route = createFileRoute("/_authenticated/_app/call-analytics")({
  head: () => pageHead("Call Analytics", "Call volume, answer rate, duration and sentiment."),
  component: () => <AnalyticsPage kind="calls" title="Call Analytics" description="Call volume, answer rate, duration and sentiment." />,
});
