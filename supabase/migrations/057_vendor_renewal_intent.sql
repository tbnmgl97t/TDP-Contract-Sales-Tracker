alter table vendor_contracts
  add column renewal_intent      boolean      default false,
  add column renewal_noted_by    text,
  add column renewal_noted_at    timestamptz,
  add column renewal_note        text;
