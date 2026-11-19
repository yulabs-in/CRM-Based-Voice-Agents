ALTER TABLE public.calls
  ADD COLUMN is_test_call boolean NOT NULL DEFAULT false;

CREATE UNIQUE INDEX calls_one_time_test_number_idx
  ON public.calls (organization_id, phone)
  WHERE is_test_call = true;