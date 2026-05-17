alter table deal_team
  drop constraint if exists deal_team_role_check;

alter table deal_team
  add constraint deal_team_role_check
  check (role in ('sales', 'support', 'partner'));
