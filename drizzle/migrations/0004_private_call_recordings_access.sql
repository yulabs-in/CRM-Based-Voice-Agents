CREATE POLICY "Workspace members can read their call recordings"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'call-recordings'
  AND CASE
    WHEN split_part(name, '/', 1) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    THEN public.is_org_member(split_part(name, '/', 1)::uuid)
    ELSE false
  END
);