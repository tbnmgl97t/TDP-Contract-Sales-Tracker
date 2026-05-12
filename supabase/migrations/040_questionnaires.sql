-- ─────────────────────────────────────────────────────────────────────────────
-- Questionnaire system
-- ─────────────────────────────────────────────────────────────────────────────

-- Question library (reusable across forms)
create table questionnaire_questions (
  id          uuid primary key default gen_random_uuid(),
  text        text not null,
  type        text not null default 'short',   -- 'short' | 'long'
  help_text   text,
  is_archived boolean not null default false,
  created_by  text,
  created_at  timestamptz default now()
);

-- Question sets / named collections
create table questionnaire_sets (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  description text,
  created_by  text,
  created_at  timestamptz default now()
);

-- Questions within a set (ordered)
create table questionnaire_set_questions (
  id          uuid primary key default gen_random_uuid(),
  set_id      uuid not null references questionnaire_sets(id) on delete cascade,
  question_id uuid not null references questionnaire_questions(id) on delete cascade,
  sort_order  int not null default 0,
  unique(set_id, question_id)
);

-- Questionnaire instances (tied to a deal)
create table questionnaires (
  id                    uuid primary key default gen_random_uuid(),
  deal_id               uuid not null references deals(id) on delete cascade,
  title                 text not null,
  intro_text            text,
  token                 text not null unique default encode(gen_random_bytes(24), 'base64url'),
  status                text not null default 'active',  -- 'active' | 'submitted' | 'expired' | 'deactivated'
  expires_at            timestamptz not null default (now() + interval '30 days'),
  reminder_days         int not null default 3,
  created_by            text,
  created_at            timestamptz default now(),
  submitted_at          timestamptz,
  activity_started_at   timestamptz,
  last_reminder_sent_at timestamptz
);

-- Questions on a questionnaire — snapshot of library at creation time
-- (library edits don't affect existing forms)
create table questionnaire_items (
  id                 uuid primary key default gen_random_uuid(),
  questionnaire_id   uuid not null references questionnaires(id) on delete cascade,
  question_id        uuid references questionnaire_questions(id),
  source_set_id      uuid references questionnaire_sets(id),
  sort_order         int not null default 0,
  question_text      text not null,
  question_type      text not null default 'short',
  question_help_text text
);

-- Single collaborative response per questionnaire
create table questionnaire_responses (
  id               uuid primary key default gen_random_uuid(),
  questionnaire_id uuid not null unique references questionnaires(id) on delete cascade,
  created_at       timestamptz default now(),
  updated_at       timestamptz default now()
);

-- One answer per item per response
create table questionnaire_answers (
  id          uuid primary key default gen_random_uuid(),
  response_id uuid not null references questionnaire_responses(id) on delete cascade,
  item_id     uuid not null references questionnaire_items(id) on delete cascade,
  answer      text,
  updated_at  timestamptz default now(),
  unique(response_id, item_id)
);

-- Activity events for notifications
create table questionnaire_events (
  id               uuid primary key default gen_random_uuid(),
  questionnaire_id uuid not null references questionnaires(id) on delete cascade,
  event_type       text not null,  -- 'viewed' | 'activity_started' | 'submitted' | 'reminder_sent'
  created_at       timestamptz default now()
);

-- ─────────────────────────────────────────────────────────────────────────────
-- RLS
-- ─────────────────────────────────────────────────────────────────────────────

alter table questionnaire_questions    enable row level security;
alter table questionnaire_sets         enable row level security;
alter table questionnaire_set_questions enable row level security;
alter table questionnaires             enable row level security;
alter table questionnaire_items        enable row level security;
alter table questionnaire_responses    enable row level security;
alter table questionnaire_answers      enable row level security;
alter table questionnaire_events       enable row level security;

-- Authenticated managers: full access
create policy "auth_all" on questionnaire_questions    for all to authenticated using (true) with check (true);
create policy "auth_all" on questionnaire_sets         for all to authenticated using (true) with check (true);
create policy "auth_all" on questionnaire_set_questions for all to authenticated using (true) with check (true);
create policy "auth_all" on questionnaires             for all to authenticated using (true) with check (true);
create policy "auth_all" on questionnaire_items        for all to authenticated using (true) with check (true);
create policy "auth_all" on questionnaire_responses    for all to authenticated using (true) with check (true);
create policy "auth_all" on questionnaire_answers      for all to authenticated using (true) with check (true);
create policy "auth_all" on questionnaire_events       for all to authenticated using (true) with check (true);

-- Anonymous (public form): read-only on questionnaire/items, full on responses/answers/events
create policy "anon_select" on questionnaires      for select to anon using (true);
create policy "anon_update" on questionnaires      for update to anon using (true) with check (true);
create policy "anon_select" on questionnaire_items for select to anon using (true);
create policy "anon_select" on questionnaire_responses for select to anon using (true);
create policy "anon_insert" on questionnaire_responses for insert to anon with check (true);
create policy "anon_update" on questionnaire_responses for update to anon using (true) with check (true);
create policy "anon_select" on questionnaire_answers   for select to anon using (true);
create policy "anon_insert" on questionnaire_answers   for insert to anon with check (true);
create policy "anon_update" on questionnaire_answers   for update to anon using (true) with check (true);
create policy "anon_insert" on questionnaire_events    for insert to anon with check (true);

-- ─────────────────────────────────────────────────────────────────────────────
-- Reminder + expiry job (pg_cron)
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function process_questionnaire_jobs()
returns void language plpgsql as $$
begin
  -- Expire overdue questionnaires
  update questionnaires
  set status = 'expired'
  where status = 'active'
    and expires_at <= now();

  -- Insert reminder events for questionnaires that:
  --   1. Are active
  --   2. Have been viewed but have no activity
  --   3. Were created more than reminder_days ago
  --   4. Haven't had a reminder in the last 7 days
  insert into questionnaire_events (questionnaire_id, event_type)
  select q.id, 'reminder_sent'
  from questionnaires q
  where q.status = 'active'
    and q.activity_started_at is null
    and q.created_at <= now() - (q.reminder_days || ' days')::interval
    and exists (
      select 1 from questionnaire_events e
      where e.questionnaire_id = q.id and e.event_type = 'viewed'
    )
    and (
      q.last_reminder_sent_at is null
      or q.last_reminder_sent_at <= now() - interval '7 days'
    );

  -- Stamp last_reminder_sent_at
  update questionnaires q
  set last_reminder_sent_at = now()
  from questionnaire_events e
  where e.questionnaire_id = q.id
    and e.event_type = 'reminder_sent'
    and e.created_at > now() - interval '1 minute';
end;
$$;

-- Uncomment after pg_cron is confirmed enabled:
-- select cron.schedule('questionnaire-jobs', '0 9 * * *', $$select process_questionnaire_jobs()$$);
