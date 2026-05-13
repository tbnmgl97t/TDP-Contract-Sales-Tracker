-- ============================================================
-- 044: Schedule daily action reminder job via pg_cron
--
-- Fires at 8:00 AM UTC daily.
-- Replace <PROJECT_REF> and <ANON_KEY> with your actual values,
-- OR run this manually in the Supabase SQL editor after deployment.
-- ============================================================

-- Enable pg_cron and pg_net extensions if not already enabled
create extension if not exists pg_cron  with schema extensions;
create extension if not exists pg_net   with schema extensions;

-- Remove any existing schedule with this name before re-creating
select cron.unschedule('send-action-reminders')
  where exists (
    select 1 from cron.job where jobname = 'send-action-reminders'
  );

-- Daily at 8:00 AM UTC
-- NOTE: After deploying this migration, update the URL and Authorization
-- header below with your project ref and anon key, then re-run this
-- single select statement in the Supabase SQL editor.
select cron.schedule(
  'send-action-reminders',
  '0 8 * * *',
  $$
    select net.http_post(
      url     := 'https://<PROJECT_REF>.supabase.co/functions/v1/send-action-reminders',
      headers := jsonb_build_object(
        'Content-Type',  'application/json',
        'Authorization', 'Bearer <ANON_KEY>'
      ),
      body    := '{}'::jsonb
    )
  $$
);
