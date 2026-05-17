-- Default slide template for new proposals
-- Each row is a slide that auto-populates when a deal has no saved proposal yet.
create table proposal_default_slides (
  id        uuid primary key default gen_random_uuid(),
  slide_key text not null,
  position  int not null default 0,
  fields    jsonb not null default '{}',
  created_at timestamptz default now()
);
