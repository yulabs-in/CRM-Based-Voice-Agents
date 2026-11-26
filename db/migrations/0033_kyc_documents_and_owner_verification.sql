-- 0033_kyc_documents_and_owner_verification.sql
--  * Client KYC documents (Aadhaar, PAN, passport, licence, voter ID, photo, address proof…) uploaded by the team.
--  * Workspace owner verification: the person who creates a workspace submits Aadhaar and PAN for review.
-- Files live in a PRIVATE storage bucket (kyc-documents), never public, viewed through short-lived signed URLs.
-- Only the masked PAN and the last 4 Aadhaar digits are stored as text; full numbers exist only on the documents.
--
-- Storage paths:
--   {organization_id}/clients/{contact_id}/{uuid}-{file}   client documents  (sales roles read/upload, managers delete)
--   {organization_id}/owner/{uuid}-{file}                   owner verification (owner/admin read, owner uploads/deletes)

-- ---------------------------------------------------------------- bucket
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('kyc-documents', 'kyc-documents', false, 5242880, array['image/jpeg', 'image/png', 'image/webp', 'application/pdf'])
on conflict (id) do update
  set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

-- A path segment that isn't a uuid must deny access, not raise an error.
create or replace function public.try_uuid(_value text) returns uuid
language plpgsql immutable set search_path = public as $$
begin
  return _value::uuid;
exception when others then
  return null;
end $$;

-- ---------------------------------------------------------------- client KYC documents
create table if not exists public.kyc_documents (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  contact_id uuid not null references public.contacts(id) on delete cascade,
  doc_type text not null check (doc_type in ('aadhaar', 'pan', 'passport', 'driving_licence', 'voter_id', 'photo', 'address_proof', 'other')),
  storage_path text not null unique,
  file_name text not null check (char_length(file_name) between 1 and 200),
  mime_type text not null check (mime_type in ('image/jpeg', 'image/png', 'image/webp', 'application/pdf')),
  size_bytes integer not null check (size_bytes > 0 and size_bytes <= 5242880),
  status text not null default 'pending' check (status in ('pending', 'verified', 'rejected')),
  notes text check (notes is null or char_length(notes) <= 1000),
  uploaded_by uuid references auth.users(id) on delete set null default auth.uid(),
  verified_by uuid references auth.users(id) on delete set null,
  verified_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint kyc_documents_path_in_folder check (storage_path like organization_id::text || '/clients/' || contact_id::text || '/%')
);
create index if not exists kyc_documents_org_contact_idx on public.kyc_documents (organization_id, contact_id, created_at desc);

create or replace function public.kyc_documents_review() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.status in ('verified', 'rejected') and (tg_op = 'INSERT' or old.status is distinct from new.status) then
    new.verified_by := coalesce(auth.uid(), new.verified_by);
    new.verified_at := now();
  elsif new.status = 'pending' then
    new.verified_by := null;
    new.verified_at := null;
  end if;
  new.updated_at := now();
  return new;
end $$;
revoke execute on function public.kyc_documents_review() from public, anon, authenticated;
drop trigger if exists kyc_documents_review on public.kyc_documents;
create trigger kyc_documents_review before insert or update on public.kyc_documents
  for each row execute function public.kyc_documents_review();

alter table public.kyc_documents enable row level security;
grant select, insert, update, delete on public.kyc_documents to authenticated;
grant all on public.kyc_documents to service_role;

create policy "sales read kyc documents" on public.kyc_documents for select to authenticated
  using (public.has_org_role(organization_id, array['owner','admin','sales_manager','team_lead','sales_rep']::public.org_role[]));
create policy "sales add kyc documents" on public.kyc_documents for insert to authenticated
  with check (public.has_org_role(organization_id, array['owner','admin','sales_manager','team_lead','sales_rep']::public.org_role[]));
create policy "sales review kyc documents" on public.kyc_documents for update to authenticated
  using (public.has_org_role(organization_id, array['owner','admin','sales_manager','team_lead','sales_rep']::public.org_role[]))
  with check (public.has_org_role(organization_id, array['owner','admin','sales_manager','team_lead','sales_rep']::public.org_role[]));
create policy "managers delete kyc documents" on public.kyc_documents for delete to authenticated
  using (public.has_org_role(organization_id, array['owner','admin','sales_manager']::public.org_role[]));

-- ---------------------------------------------------------------- workspace owner verification
create table if not exists public.organization_verifications (
  organization_id uuid primary key references public.organizations(id) on delete cascade,
  submitted_by uuid references auth.users(id) on delete set null,
  legal_name text check (legal_name is null or char_length(legal_name) between 2 and 120),
  pan_masked text check (pan_masked is null or pan_masked ~ '^[A-Z]{3}x{4,5}[0-9A-Z]{1,2}$'),
  aadhaar_last4 text check (aadhaar_last4 is null or aadhaar_last4 ~ '^[0-9]{4}$'),
  pan_document_path text,
  aadhaar_front_path text,
  aadhaar_back_path text,
  status text not null default 'not_submitted' check (status in ('not_submitted', 'pending', 'verified', 'rejected')),
  submitted_at timestamptz,
  reviewed_at timestamptz,
  review_note text,
  updated_at timestamptz not null default now(),
  constraint organization_verifications_paths check (
    (pan_document_path is null or pan_document_path like organization_id::text || '/owner/%') and
    (aadhaar_front_path is null or aadhaar_front_path like organization_id::text || '/owner/%') and
    (aadhaar_back_path is null or aadhaar_back_path like organization_id::text || '/owner/%')
  )
);

-- Workspace members can only submit (status becomes pending). Verifying or rejecting is done by the platform
-- (service role), so nobody can mark their own workspace verified.
create or replace function public.organization_verification_guard() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    if tg_op = 'UPDATE' then
      new.reviewed_at := old.reviewed_at;
      new.review_note := old.review_note;
      if old.status = 'verified' then
        raise exception 'This workspace is already verified. Contact support to change verification details.';
      end if;
    else
      new.reviewed_at := null;
      new.review_note := null;
    end if;
    if new.status <> 'not_submitted' then
      if new.legal_name is null or new.pan_masked is null or new.aadhaar_last4 is null
         or new.pan_document_path is null or new.aadhaar_front_path is null then
        raise exception 'Add your legal name, PAN, Aadhaar and the PAN and Aadhaar documents before submitting';
      end if;
      new.status := 'pending';
      new.submitted_at := now();
      new.submitted_by := auth.uid();
    end if;
  elsif new.status in ('verified', 'rejected') and (tg_op = 'INSERT' or old.status is distinct from new.status) then
    new.reviewed_at := now();
  end if;
  new.updated_at := now();
  return new;
end $$;
revoke execute on function public.organization_verification_guard() from public, anon, authenticated;
drop trigger if exists organization_verification_guard on public.organization_verifications;
create trigger organization_verification_guard before insert or update on public.organization_verifications
  for each row execute function public.organization_verification_guard();

alter table public.organization_verifications enable row level security;
grant select, insert, update on public.organization_verifications to authenticated;
grant all on public.organization_verifications to service_role;

create policy "admins read verification" on public.organization_verifications for select to authenticated
  using (public.has_org_role(organization_id, array['owner','admin']::public.org_role[]));
create policy "owner submits verification" on public.organization_verifications for insert to authenticated
  with check (public.has_org_role(organization_id, array['owner']::public.org_role[]));
create policy "owner updates verification" on public.organization_verifications for update to authenticated
  using (public.has_org_role(organization_id, array['owner']::public.org_role[]))
  with check (public.has_org_role(organization_id, array['owner']::public.org_role[]));

-- ---------------------------------------------------------------- storage policies (bucket kyc-documents)
drop policy if exists "kyc docs read" on storage.objects;
drop policy if exists "kyc docs upload" on storage.objects;
drop policy if exists "kyc docs delete" on storage.objects;

create policy "kyc docs read" on storage.objects for select to authenticated
  using (bucket_id = 'kyc-documents' and (
    ((storage.foldername(name))[2] = 'clients' and public.has_org_role(public.try_uuid((storage.foldername(name))[1]), array['owner','admin','sales_manager','team_lead','sales_rep']::public.org_role[]))
    or ((storage.foldername(name))[2] = 'owner' and public.has_org_role(public.try_uuid((storage.foldername(name))[1]), array['owner','admin']::public.org_role[]))
  ));

create policy "kyc docs upload" on storage.objects for insert to authenticated
  with check (bucket_id = 'kyc-documents' and (
    ((storage.foldername(name))[2] = 'clients' and public.has_org_role(public.try_uuid((storage.foldername(name))[1]), array['owner','admin','sales_manager','team_lead','sales_rep']::public.org_role[]))
    or ((storage.foldername(name))[2] = 'owner' and public.has_org_role(public.try_uuid((storage.foldername(name))[1]), array['owner']::public.org_role[]))
  ));

create policy "kyc docs delete" on storage.objects for delete to authenticated
  using (bucket_id = 'kyc-documents' and (
    ((storage.foldername(name))[2] = 'clients' and public.has_org_role(public.try_uuid((storage.foldername(name))[1]), array['owner','admin','sales_manager']::public.org_role[]))
    or ((storage.foldername(name))[2] = 'owner' and public.has_org_role(public.try_uuid((storage.foldername(name))[1]), array['owner']::public.org_role[]))
  ));
