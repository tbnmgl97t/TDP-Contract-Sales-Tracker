-- Add notice period field to vendor_contracts
alter table vendor_contracts add column notice_period_days int;

-- Log table to prevent duplicate reminder sends
create table vendor_reminder_log (
  id           uuid primary key default gen_random_uuid(),
  contract_id  uuid not null references vendor_contracts(id) on delete cascade,
  days_before  int not null,  -- 60, 30, or 7
  sent_at      timestamptz default now(),
  unique(contract_id, days_before)
);
