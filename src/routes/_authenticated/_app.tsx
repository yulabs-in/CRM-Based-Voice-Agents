import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { AppShell } from "@/components/app/AppShell";
import { OrgProvider, membershipsQuery } from "@/lib/org";

export const Route = createFileRoute("/_authenticated/_app")({
  loader: async ({ context }) => {
    const memberships = await context.queryClient.fetchQuery(membershipsQuery);
    if (!memberships.length) throw redirect({ to: "/onboarding" });
    return { memberships };
  },
  component: AppLayout,
});

function AppLayout() {
  const { memberships } = Route.useLoaderData();
  const { user } = Route.useRouteContext();
  return (
    <OrgProvider memberships={memberships} userId={user.id} email={user.email ?? ""}>
      <AppShell><Outlet /></AppShell>
    </OrgProvider>
  );
}
