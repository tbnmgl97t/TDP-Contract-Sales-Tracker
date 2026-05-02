-- SalesFlow — Trilogy Digital
-- Initial schema migration

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ─────────────────────────────────────────
-- VENDORS
-- ─────────────────────────────────────────
CREATE TABLE vendors (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name       TEXT NOT NULL,
  website    TEXT,
  notes      TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ─────────────────────────────────────────
-- CATEGORIES
-- ─────────────────────────────────────────
CREATE TABLE categories (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT NOT NULL,
  description TEXT,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- ─────────────────────────────────────────
-- PRODUCTS
-- ─────────────────────────────────────────
CREATE TABLE products (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name                TEXT NOT NULL,
  vendor_id           UUID REFERENCES vendors(id) ON DELETE SET NULL,
  category_id         UUID REFERENCES categories(id) ON DELETE SET NULL,
  commission_metric   TEXT NOT NULL CHECK (commission_metric IN ('NAVC/RAV', 'GM')),
  base_rate           DECIMAL(6,5) NOT NULL DEFAULT 0.07,
  is_usage_based      BOOLEAN DEFAULT FALSE,
  unit_label          TEXT,   -- e.g., 'GB', 'Hours'
  active              BOOLEAN DEFAULT TRUE,
  created_at          TIMESTAMPTZ DEFAULT NOW(),
  updated_at          TIMESTAMPTZ DEFAULT NOW()
);

-- ─────────────────────────────────────────
-- PRODUCT PRICING PARAMS
-- Configurable values — only affect future deals.
-- ─────────────────────────────────────────
CREATE TABLE product_pricing_params (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id     UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  unit_price     DECIMAL(12,6),     -- revenue per unit (for usage-based products)
  cogs_per_unit  DECIMAL(12,6),     -- COGS per unit (for usage-based products)
  effective_date DATE NOT NULL DEFAULT CURRENT_DATE,
  notes          TEXT,
  created_by     TEXT,
  created_at     TIMESTAMPTZ DEFAULT NOW()
);

-- ─────────────────────────────────────────
-- PEOPLE
-- ─────────────────────────────────────────
CREATE TABLE people (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name       TEXT NOT NULL,
  email      TEXT UNIQUE,
  role       TEXT NOT NULL CHECK (role IN ('sales', 'support', 'management')),
  active     BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ─────────────────────────────────────────
-- SPIF TIERS (per person)
-- ─────────────────────────────────────────
CREATE TABLE spif_tiers (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  person_id   UUID NOT NULL REFERENCES people(id) ON DELETE CASCADE,
  acv_min     DECIMAL(12,2) NOT NULL DEFAULT 0,
  acv_max     DECIMAL(12,2),          -- NULL = no upper limit
  spif_amount DECIMAL(10,2) NOT NULL,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- ─────────────────────────────────────────
-- DEALS
-- ─────────────────────────────────────────
CREATE TABLE deals (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name                TEXT NOT NULL,
  company_name        TEXT NOT NULL,
  stage               TEXT NOT NULL DEFAULT 'lead'
                        CHECK (stage IN ('lead','qualified','discovery','proposal','negotiation','contracted','closed_lost')),
  deal_type           TEXT CHECK (deal_type IN ('new','renewal')),
  is_tbn_property     BOOLEAN DEFAULT FALSE,
  contract_start      DATE,
  contract_end        DATE,
  contract_months     INTEGER DEFAULT 12,
  acv                 DECIMAL(12,2),
  total_contract_value DECIMAL(12,2),
  notes               TEXT,
  created_at          TIMESTAMPTZ DEFAULT NOW(),
  updated_at          TIMESTAMPTZ DEFAULT NOW()
);

-- ─────────────────────────────────────────
-- DEAL PRODUCTS
-- ─────────────────────────────────────────
CREATE TABLE deal_products (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  deal_id               UUID NOT NULL REFERENCES deals(id) ON DELETE CASCADE,
  product_id            UUID REFERENCES products(id),
  commission_metric     TEXT,
  base_rate             DECIMAL(6,5) DEFAULT 0.07,

  -- NAVC/RAV fields
  monthly_value         DECIMAL(12,2),
  annual_value          DECIMAL(12,2),

  -- Usage-based (GM) fields — snapshots taken at time of deal
  monthly_quantity      DECIMAL(14,4),
  unit_price_snapshot   DECIMAL(12,6),
  cogs_per_unit_snapshot DECIMAL(12,6),
  monthly_cost          DECIMAL(12,2),
  total_revenue         DECIMAL(12,2),
  cogs_amount           DECIMAL(12,2),
  net_revenue           DECIMAL(12,2),

  -- Calculated
  commission_amount     DECIMAL(12,2),

  created_at            TIMESTAMPTZ DEFAULT NOW()
);

-- ─────────────────────────────────────────
-- DEAL TEAM
-- ─────────────────────────────────────────
CREATE TABLE deal_team (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  deal_id            UUID NOT NULL REFERENCES deals(id) ON DELETE CASCADE,
  person_id          UUID NOT NULL REFERENCES people(id),
  role               TEXT NOT NULL CHECK (role IN ('sales','support')),
  commission_percent DECIMAL(5,2) DEFAULT 0,  -- for sales (must sum to 100)
  spif_amount        DECIMAL(10,2) DEFAULT 0,  -- calculated based on ACV tier
  created_at         TIMESTAMPTZ DEFAULT NOW()
);

-- ─────────────────────────────────────────
-- CONTRACTS (uploaded documents)
-- ─────────────────────────────────────────
CREATE TABLE contracts (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  deal_id     UUID NOT NULL REFERENCES deals(id) ON DELETE CASCADE,
  file_name   TEXT NOT NULL,
  file_path   TEXT NOT NULL,   -- Supabase Storage object path
  file_url    TEXT,
  file_size   BIGINT,
  mime_type   TEXT,
  uploaded_at TIMESTAMPTZ DEFAULT NOW()
);

-- ─────────────────────────────────────────
-- QUARTERLY COMMISSION SNAPSHOTS
-- ─────────────────────────────────────────
CREATE TABLE quarterly_commissions (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  deal_id     UUID NOT NULL REFERENCES deals(id) ON DELETE CASCADE,
  person_id   UUID NOT NULL REFERENCES people(id),
  quarter     SMALLINT NOT NULL CHECK (quarter BETWEEN 1 AND 4),
  year        SMALLINT NOT NULL,
  type        TEXT NOT NULL CHECK (type IN ('commission','spif')),
  amount      DECIMAL(12,2) NOT NULL,
  is_paid     BOOLEAN DEFAULT FALSE,
  paid_date   DATE,
  notes       TEXT,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- ─────────────────────────────────────────
-- INDEXES
-- ─────────────────────────────────────────
CREATE INDEX idx_deals_stage ON deals(stage);
CREATE INDEX idx_deals_company ON deals(company_name);
CREATE INDEX idx_deal_products_deal ON deal_products(deal_id);
CREATE INDEX idx_deal_team_deal ON deal_team(deal_id);
CREATE INDEX idx_contracts_deal ON contracts(deal_id);
CREATE INDEX idx_quarterly_commissions_deal ON quarterly_commissions(deal_id);
CREATE INDEX idx_quarterly_commissions_person ON quarterly_commissions(person_id);
CREATE INDEX idx_quarterly_commissions_period ON quarterly_commissions(year, quarter);

-- ─────────────────────────────────────────
-- SEED DATA
-- ─────────────────────────────────────────

-- Vendors
INSERT INTO vendors (name) VALUES
  ('Trilogy Digital'),
  ('JWX'),
  ('Applicaster'),
  ('Okta'),
  ('OneTrust');

-- Categories
INSERT INTO categories (name, description) VALUES
  ('Core SaaS', 'Trilogy Digital owned SaaS products'),
  ('Resell', 'Third-party products resold by Trilogy Digital'),
  ('Services', 'Professional and managed services');

-- Products (vendor and category joined by name for readability)
WITH v AS (SELECT id, name FROM vendors), c AS (SELECT id, name FROM categories)
INSERT INTO products (name, vendor_id, category_id, commission_metric, base_rate, is_usage_based, unit_label) VALUES
  -- Core SaaS
  ('Backstage',        (SELECT id FROM v WHERE name='Trilogy Digital'), (SELECT id FROM c WHERE name='Core SaaS'),   'NAVC/RAV', 0.07, FALSE, NULL),
  ('DataSmith',        (SELECT id FROM v WHERE name='Trilogy Digital'), (SELECT id FROM c WHERE name='Core SaaS'),   'NAVC/RAV', 0.07, FALSE, NULL),
  ('Monetize',         (SELECT id FROM v WHERE name='Trilogy Digital'), (SELECT id FROM c WHERE name='Core SaaS'),   'NAVC/RAV', 0.07, FALSE, NULL),
  ('Web Hosting',      (SELECT id FROM v WHERE name='Trilogy Digital'), (SELECT id FROM c WHERE name='Core SaaS'),   'NAVC/RAV', 0.07, FALSE, NULL),
  ('Web App',          (SELECT id FROM v WHERE name='Trilogy Digital'), (SELECT id FROM c WHERE name='Core SaaS'),   'NAVC/RAV', 0.07, FALSE, NULL),
  ('EventHubLive',     (SELECT id FROM v WHERE name='Trilogy Digital'), (SELECT id FROM c WHERE name='Core SaaS'),   'NAVC/RAV', 0.07, FALSE, NULL),
  -- Resell - JWX usage-based
  ('Media Delivery',              (SELECT id FROM v WHERE name='JWX'),         (SELECT id FROM c WHERE name='Resell'), 'GM', 0.07, TRUE, 'GB'),
  ('Live Hours Ingested',         (SELECT id FROM v WHERE name='JWX'),         (SELECT id FROM c WHERE name='Resell'), 'GM', 0.07, TRUE, 'Hours'),
  ('Hours Hosted Total',          (SELECT id FROM v WHERE name='JWX'),         (SELECT id FROM c WHERE name='Resell'), 'GM', 0.07, TRUE, 'Hours'),
  -- Resell - other
  ('CTV Apps',                    (SELECT id FROM v WHERE name='Applicaster'),  (SELECT id FROM c WHERE name='Resell'), 'GM', 0.07, FALSE, NULL),
  ('Mobile Apps',                 (SELECT id FROM v WHERE name='Applicaster'),  (SELECT id FROM c WHERE name='Resell'), 'GM', 0.07, FALSE, NULL),
  ('User Management (10K Users)', (SELECT id FROM v WHERE name='Okta'),         (SELECT id FROM c WHERE name='Resell'), 'GM', 0.07, FALSE, NULL),
  ('OneTrust',                    (SELECT id FROM v WHERE name='OneTrust'),     (SELECT id FROM c WHERE name='Resell'), 'GM', 0.07, FALSE, NULL),
  -- Services
  ('Professional Services',       (SELECT id FROM v WHERE name='Trilogy Digital'), (SELECT id FROM c WHERE name='Services'), 'NAVC/RAV', 0.07, FALSE, NULL);

-- JWX pricing params (based on spreadsheet data)
WITH p AS (SELECT id, name FROM products)
INSERT INTO product_pricing_params (product_id, unit_price, cogs_per_unit, notes) VALUES
  ((SELECT id FROM p WHERE name='Media Delivery'),      0.021000, 0.003000, 'Initial pricing — source: PBR 2026 Sample'),
  ((SELECT id FROM p WHERE name='Live Hours Ingested'), 9.800000, 1.400000, 'Initial pricing — source: PBR 2026 Sample'),
  ((SELECT id FROM p WHERE name='Hours Hosted Total'),  0.450000, 0.230000, 'Initial pricing — source: PBR 2026 Sample');

-- People
INSERT INTO people (name, email, role) VALUES
  ('Colten Dunham',   'colten@trilogydigital.com',  'sales'),
  ('Murthy Avanithsa','murthy@trilogydigital.com',  'support'),
  ('Marcus Lopez',    'mlopez@trilogydigital.com',  'management');

-- SPIF tiers (from commission plan)
WITH p AS (SELECT id, name FROM people)
INSERT INTO spif_tiers (person_id, acv_min, acv_max, spif_amount) VALUES
  ((SELECT id FROM p WHERE name='Colten Dunham'),   30000, 60000, 250),
  ((SELECT id FROM p WHERE name='Colten Dunham'),   60000, NULL,  500),
  ((SELECT id FROM p WHERE name='Murthy Avanithsa'),30000, 60000, 250),
  ((SELECT id FROM p WHERE name='Murthy Avanithsa'),60000, NULL,  500);
