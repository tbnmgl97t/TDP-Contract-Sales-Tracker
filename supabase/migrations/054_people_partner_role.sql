alter table people
  drop constraint if exists people_role_check;

alter table people
  add constraint people_role_check
  check (role in ('sales', 'support', 'management', 'partner'));
