-- RLS helpers and accept_invitation are only needed by signed-in users (all policies are `to authenticated`).
revoke execute on function public.is_org_member(uuid) from public, anon;
revoke execute on function public.can_write_org(uuid) from public, anon;
revoke execute on function public.has_org_role(uuid, public.org_role[]) from public, anon;
revoke execute on function public.accept_invitation(uuid) from public, anon;
grant execute on function public.is_org_member(uuid) to authenticated, service_role;
grant execute on function public.can_write_org(uuid) to authenticated, service_role;
grant execute on function public.has_org_role(uuid, public.org_role[]) to authenticated, service_role;
grant execute on function public.accept_invitation(uuid) to authenticated, service_role;
