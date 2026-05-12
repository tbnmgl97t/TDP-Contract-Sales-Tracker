-- Deal amendment workflow: track mid-contract product cancellations and additions.
--
-- deal_amendments  — one row per amendment event (cancellation or addition)
-- deal_products    — gains status, amendment_id, cancellation_amendment_id

-- -----------------------------------------------------------------------
-- 1. Amendment events
-- -----------------------------------------------------------------------

create table deal_amendments (
  id             uuid primary key default gen_random_uuid(),
  deal_id        uuid not null references deals(id) on delete cascade,
  effective_date date not null,
  note           text,
  created_by     text,
  created_at     timestamptz default now()
);

create index deal_amendments_deal_id_idx on deal_amendments(deal_id);

-- -----------------------------------------------------------------------
-- 2. Additions to deal_products
-- -----------------------------------------------------------------------

-- Which amendment added this product (null = original contract)
alter table deal_products
  add column amendment_id uuid references deal_amendments(id);

-- 'active' | 'cancelled'
alter table deal_products
  add column status text not null default 'active';

-- Which amendment cancelled this product (null = still active)
alter table deal_products
  add column cancellation_amendment_id uuid references deal_amendments(id);
