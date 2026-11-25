-- 0024_sales_ops_hardening.sql: tidy-ups from the Supabase security advisor after 0020/0021.
-- Trigger functions are never meant to be called over the REST API, so nobody but the owner may execute them.
alter function public.touch_updated_at() set search_path = public;

revoke execute on function public.touch_updated_at() from public, anon, authenticated;
revoke execute on function public.check_reports_to() from public, anon, authenticated;
revoke execute on function public.reassign_reports_on_leave() from public, anon, authenticated;
revoke execute on function public.sales_orders_before_insert() from public, anon, authenticated;
revoke execute on function public.payments_check_order() from public, anon, authenticated;
revoke execute on function public.refresh_order_amount_paid() from public, anon, authenticated;
revoke execute on function public.client_kyc_verification() from public, anon, authenticated;
