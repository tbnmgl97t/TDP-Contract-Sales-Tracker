-- Renewal workflow: link renewal deals to their predecessor and track renewal type

alter table deals
  add column if not exists predecessor_deal_id uuid references deals(id),
  add column if not exists renewal_type text check (renewal_type in ('flat', 'expansion', 'contraction', 'churn'));

comment on column deals.predecessor_deal_id is 'The deal this renewal was created from';
comment on column deals.renewal_type       is 'flat | expansion | contraction | churn';
