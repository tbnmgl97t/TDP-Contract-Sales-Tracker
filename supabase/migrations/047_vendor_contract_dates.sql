alter table vendor_contracts
  add column start_date date,
  add column end_date   date;   -- null = active; set when contract is terminated
