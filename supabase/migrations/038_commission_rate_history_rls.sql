-- RLS policies for commission_rate_history
alter table commission_rate_history enable row level security;

-- Managers (authenticated users) can read all rate history
create policy "Authenticated users can read commission rate history"
  on commission_rate_history for select
  to authenticated
  using (true);

-- Managers can insert new rate entries
create policy "Authenticated users can insert commission rate history"
  on commission_rate_history for insert
  to authenticated
  with check (true);

-- Managers can update (e.g. supersede, activate scheduled entries)
create policy "Authenticated users can update commission rate history"
  on commission_rate_history for update
  to authenticated
  using (true);
