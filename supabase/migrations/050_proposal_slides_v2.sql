-- Shared asset library (logos, team photos, case study images)
create table proposal_assets (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  url         text not null,
  bucket_path text not null,
  category    text not null default 'general',  -- 'logo' | 'team' | 'case_study' | 'general'
  uploaded_by text,
  created_at  timestamptz default now()
);

-- New component-based slide instances (one row per slide per proposal)
create table proposal_slides (
  id          uuid primary key default gen_random_uuid(),
  deal_id     uuid not null references deals(id) on delete cascade,
  slide_key   text not null,
  position    int not null default 0,
  fields      jsonb not null default '{}',
  created_at  timestamptz default now(),
  updated_at  timestamptz default now()
);

create index proposal_slides_deal_id_idx on proposal_slides(deal_id);
