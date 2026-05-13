-- ============================================================
-- 043: Deal Notes, Actions, Reminders, and Notifications
-- ============================================================

-- ------------------------------------------------------------
-- 1. deal_notes
--    Timestamped log entries on a deal (note / call / email / meeting)
-- ------------------------------------------------------------
create table if not exists deal_notes (
  id          uuid primary key default gen_random_uuid(),
  deal_id     uuid not null references deals(id) on delete cascade,
  content     text not null,
  note_type   text not null default 'note'
                check (note_type in ('note', 'call', 'email', 'meeting')),
  created_by  text,
  created_at  timestamptz not null default now()
);

create index deal_notes_deal_id_idx on deal_notes(deal_id);
create index deal_notes_created_at_idx on deal_notes(created_at desc);

-- ------------------------------------------------------------
-- 2. deal_actions
--    Tasks attached to a deal, optionally linked to a note
-- ------------------------------------------------------------
create table if not exists deal_actions (
  id             uuid primary key default gen_random_uuid(),
  deal_id        uuid not null references deals(id) on delete cascade,
  note_id        uuid references deal_notes(id) on delete set null,
  title          text not null,
  due_date       date not null,
  completed_at   timestamptz,
  completed_by   text,
  created_by     text,
  created_at     timestamptz not null default now()
);

create index deal_actions_deal_id_idx  on deal_actions(deal_id);
create index deal_actions_due_date_idx on deal_actions(due_date) where completed_at is null;

-- ------------------------------------------------------------
-- 3. action_reminders
--    Tracks which reminder emails have already fired per action
--    to prevent duplicate sends across cron runs
-- ------------------------------------------------------------
create table if not exists action_reminders (
  id          uuid primary key default gen_random_uuid(),
  action_id   uuid not null references deal_actions(id) on delete cascade,
  days_before int  not null,   -- 0 = day-of, 1 = 1 day before, 3 = 3 days before, etc.
  sent_at     timestamptz not null default now(),
  unique (action_id, days_before)
);

-- ------------------------------------------------------------
-- 4. notifications
--    In-app notification inbox — one row per recipient per event
-- ------------------------------------------------------------
create table if not exists notifications (
  id          uuid primary key default gen_random_uuid(),
  user_email  text not null,
  type        text not null default 'action_reminder',
  title       text not null,
  body        text,
  deal_id     uuid references deals(id) on delete cascade,
  action_id   uuid references deal_actions(id) on delete cascade,
  read_at     timestamptz,
  created_at  timestamptz not null default now()
);

create index notifications_user_email_idx  on notifications(user_email);
create index notifications_unread_idx      on notifications(user_email, created_at desc) where read_at is null;

-- ------------------------------------------------------------
-- 5. reminder_settings
--    Global configuration for which days-before to send reminders.
--    Single row (id = 1). reminder_days is an int array, e.g. {3,1,0}.
-- ------------------------------------------------------------
create table if not exists reminder_settings (
  id             int primary key default 1,
  reminder_days  int[] not null default '{3,1,0}',
  updated_at     timestamptz not null default now()
);

-- Seed the default row
insert into reminder_settings (id, reminder_days)
values (1, '{3,1,0}')
on conflict (id) do nothing;

-- ------------------------------------------------------------
-- 6. RLS — enable but keep permissive for now (same pattern as
--    other tables in this project; tighten per-role as needed)
-- ------------------------------------------------------------
alter table deal_notes        enable row level security;
alter table deal_actions      enable row level security;
alter table action_reminders  enable row level security;
alter table notifications     enable row level security;
alter table reminder_settings enable row level security;

create policy "deal_notes_all"        on deal_notes        for all using (true) with check (true);
create policy "deal_actions_all"      on deal_actions      for all using (true) with check (true);
create policy "action_reminders_all"  on action_reminders  for all using (true) with check (true);
create policy "notifications_all"     on notifications     for all using (true) with check (true);
create policy "reminder_settings_all" on reminder_settings for all using (true) with check (true);
