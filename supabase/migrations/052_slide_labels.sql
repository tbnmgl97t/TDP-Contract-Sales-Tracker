-- Custom display names for slides (so the same slide_key can be reused with different labels)
alter table proposal_slides add column label text;
alter table proposal_default_slides add column label text;
