-- Versioned commission rules document

create table commission_rules_history (
  id             uuid primary key default gen_random_uuid(),
  content        text not null,
  effective_date date not null,
  status         text not null default 'active', -- 'active' | 'superseded'
  note           text,
  created_by     text,
  created_at     timestamptz default now()
);

-- RLS
alter table commission_rules_history enable row level security;

create policy "Authenticated users can read commission rules"
  on commission_rules_history for select
  to authenticated using (true);

create policy "Authenticated users can insert commission rules"
  on commission_rules_history for insert
  to authenticated with check (true);

create policy "Authenticated users can update commission rules"
  on commission_rules_history for update
  to authenticated using (true);

-- Seed current rules as version 1
insert into commission_rules_history (content, effective_date, status, note)
values (
  '## Trilogy Digital Commission Plan

**Effective:** January 1, 2026

---

### Calculation Basis

- Core SaaS & Professional Services are calculated on **NAVC/RAV** at the global commission rate.
- Resold Technology commissions are based on **Gross Margin (GM)** at the global commission rate.

### Payment Rules

- Commission is paid only on **collected revenue** per quarter.
- SPIF payments are paid in the **quarter following contract execution**.
- SPIFs are subtracted from the total commission pool before distribution.

### Exclusions

- TBN properties are **excluded** from all commission calculations.

### Approval & Oversight

- Customer commission % allocations are set per deal by Marcus Lopez.
- Any commission payable to Marcus Lopez requires approval by Emanuel Eddyson.
- All commissions are subject to finance and executive approval.

### Plan Revisions

- The commission plan can be revised **per quarter**.
- Rate changes are effective on the first day of the applicable quarter unless otherwise noted.',
  '2026-01-01',
  'active',
  'Initial plan — system setup'
);
