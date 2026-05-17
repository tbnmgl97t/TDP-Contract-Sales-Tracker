-- Vendor contracts (multiple per vendor)
create table vendor_contracts (
  id            uuid primary key default gen_random_uuid(),
  vendor_id     uuid not null references vendors(id) on delete cascade,
  title         text not null,
  contract_type text not null default 'other',
  -- values: 'msa' | 'sow' | 'nda' | 'license' | 'amendment' | 'addendum' | 'other'
  notes         text,
  created_by    text,
  created_at    timestamptz default now()
);

-- Documents attached to a vendor contract
create table vendor_contract_documents (
  id           uuid primary key default gen_random_uuid(),
  contract_id  uuid not null references vendor_contracts(id) on delete cascade,
  vendor_id    uuid not null references vendors(id) on delete cascade,
  file_name    text not null,
  file_path    text not null,
  file_size    bigint,
  mime_type    text,
  uploaded_by  text,
  uploaded_at  timestamptz default now()
);

-- RLS: same open policy pattern used elsewhere in this project
alter table vendor_contracts          enable row level security;
alter table vendor_contract_documents enable row level security;

create policy "vendor_contracts_all"          on vendor_contracts          for all using (true) with check (true);
create policy "vendor_contract_documents_all" on vendor_contract_documents for all using (true) with check (true);
