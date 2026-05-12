-- Commission rate history & scheduling

-- History table: every rate change, past and future
create table commission_rate_history (
  id             uuid primary key default gen_random_uuid(),
  rate           numeric(6,4) not null,          -- e.g. 0.0500 for 5%
  effective_date date not null,
  status         text not null default 'scheduled', -- 'scheduled' | 'active' | 'superseded'
  note           text,
  created_by     text,
  created_at     timestamptz default now(),
  applied_at     timestamptz
);

-- Lock commission rate on deals at contracting time
alter table deals
  add column if not exists commission_locked_rate numeric(6,4),
  add column if not exists commission_locked_at   timestamptz;

-- Seed current active rate from commission_settings
insert into commission_rate_history (rate, effective_date, status, note, applied_at)
select
  coalesce(global_commission_rate, 0.05),
  '2026-01-01',
  'active',
  'Initial rate — system setup',
  now()
from commission_settings
where id = 1;

-- Function called by pg_cron nightly to activate scheduled rate changes
create or replace function apply_scheduled_commission_rates()
returns void language plpgsql as $$
declare
  pending record;
begin
  for pending in
    select * from commission_rate_history
    where status = 'scheduled'
      and effective_date <= current_date
    order by effective_date asc
  loop
    -- Supersede the current active rate
    update commission_rate_history
    set status = 'superseded'
    where status = 'active';

    -- Activate this scheduled rate
    update commission_rate_history
    set status = 'active', applied_at = now()
    where id = pending.id;

    -- Sync commission_settings so the app reads the right value
    update commission_settings
    set global_commission_rate = pending.rate,
        updated_at = now()
    where id = 1;
  end loop;
end;
$$;

-- Enable pg_cron (requires the extension to be enabled in your Supabase project)
-- Run in Supabase Dashboard > Database > Extensions if not already enabled.
-- Once enabled, uncomment the line below:
-- select cron.schedule('apply-commission-rates', '0 0 * * *', $$select apply_scheduled_commission_rates()$$);
