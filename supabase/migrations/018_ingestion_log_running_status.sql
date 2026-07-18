ALTER TABLE public.ingestion_log
  DROP CONSTRAINT ingestion_log_status_check;

ALTER TABLE public.ingestion_log
  ADD CONSTRAINT ingestion_log_status_check
  CHECK (status IN ('running', 'success', 'partial', 'failed'));
