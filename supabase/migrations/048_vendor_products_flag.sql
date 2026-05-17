-- Whether this vendor's products should appear in the product/deal selectors
alter table vendors
  add column show_in_products boolean not null default true;

-- Tag contract documents as termination documentation
alter table vendor_contract_documents
  add column is_termination_doc boolean not null default false;
