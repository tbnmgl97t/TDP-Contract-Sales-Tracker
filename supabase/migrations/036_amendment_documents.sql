-- Supporting documents for deal amendments (e.g. cancellation notice emails, signed addenda)

create table amendment_documents (
  id           uuid primary key default gen_random_uuid(),
  amendment_id uuid not null references deal_amendments(id) on delete cascade,
  deal_id      uuid not null references deals(id) on delete cascade,
  file_name    text not null,
  file_path    text not null,
  file_size    bigint,
  mime_type    text,
  uploaded_at  timestamptz default now()
);

create index amendment_documents_amendment_id_idx on amendment_documents(amendment_id);
create index amendment_documents_deal_id_idx on amendment_documents(deal_id);
