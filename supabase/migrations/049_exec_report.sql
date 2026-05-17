-- Executive summary narrative on the deal (rich text HTML)
alter table deals
  add column executive_summary text;

-- Per-person commission justification on deal_team (rich text HTML)
alter table deal_team
  add column commission_justification text;
