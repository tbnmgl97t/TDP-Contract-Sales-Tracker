create table partner_agreements (
  id                 uuid primary key default gen_random_uuid(),
  partner_id         uuid not null references partners(id) on delete cascade,
  title              text not null,
  agreement_type     text not null default 'agreement',
  start_date         date,
  end_date           date,
  notice_period_days int,
  renewal_intent     boolean default false,
  renewal_noted_by   text,
  renewal_noted_at   timestamptz,
  renewal_note       text,
  notes              text,
  created_at         timestamptz default now()
);

create table partner_agreement_documents (
  id            uuid primary key default gen_random_uuid(),
  agreement_id  uuid not null references partner_agreements(id) on delete cascade,
  partner_id    uuid not null references partners(id) on delete cascade,
  file_name     text not null,
  file_path     text not null,
  file_size     bigint,
  mime_type     text,
  uploaded_at   timestamptz default now(),
  uploaded_by   text
);

create index partner_agreements_partner_id_idx on partner_agreements(partner_id);
create index partner_agreement_docs_agreement_id_idx on partner_agreement_documents(agreement_id);
