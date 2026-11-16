import { createFileRoute } from "@tanstack/react-router";
import { AnalyticsPage } from "@/components/app/AnalyticsPage";
import { pageHead } from "@/lib/seo";

export const Route = createFileRoute("/_authenticated/_app/sales-analytics")({
  head: () => pageHead("Sales Analytics", "Revenue, win rate and lead conversion."),
  component: () => <AnalyticsPage kind="sales" title="Sales Analytics" description="Revenue, win rate and lead conversion." />,
});
