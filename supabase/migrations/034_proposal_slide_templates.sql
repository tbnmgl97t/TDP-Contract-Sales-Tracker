-- Slide template library
CREATE TABLE proposal_slide_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  image_url TEXT NOT NULL,        -- Supabase storage public URL
  image_path TEXT NOT NULL,       -- Supabase storage path (for deletion)
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Editable text zones on a template (optional — no zones = image-only slide)
CREATE TABLE proposal_slide_zones (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id UUID NOT NULL REFERENCES proposal_slide_templates(id) ON DELETE CASCADE,
  label TEXT NOT NULL,            -- "Headline", "Body", "Stat"
  x_pct NUMERIC(6,3) NOT NULL,   -- left edge, 0–100% of slide width
  y_pct NUMERIC(6,3) NOT NULL,   -- top edge, 0–100% of slide height
  w_pct NUMERIC(6,3) NOT NULL,   -- zone width as % of slide width
  h_pct NUMERIC(6,3) NOT NULL,   -- zone height as % of slide height
  font_size INTEGER NOT NULL DEFAULT 24,
  font_color TEXT NOT NULL DEFAULT '#17263A',
  font_weight TEXT NOT NULL DEFAULT 'normal',  -- 'normal' | 'bold'
  text_align TEXT NOT NULL DEFAULT 'left',     -- 'left' | 'center' | 'right'
  default_text TEXT NOT NULL DEFAULT '',
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Per-deal proposal: which templates are selected and what text is in each zone
CREATE TABLE deal_proposal_slides (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  deal_id UUID NOT NULL REFERENCES deals(id) ON DELETE CASCADE,
  template_id UUID NOT NULL REFERENCES proposal_slide_templates(id) ON DELETE CASCADE,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- The actual text entered for each zone in a deal's proposal
CREATE TABLE deal_proposal_zone_content (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  deal_proposal_slide_id UUID NOT NULL REFERENCES deal_proposal_slides(id) ON DELETE CASCADE,
  zone_id UUID NOT NULL REFERENCES proposal_slide_zones(id) ON DELETE CASCADE,
  content TEXT NOT NULL DEFAULT '',
  UNIQUE (deal_proposal_slide_id, zone_id)
);

-- RLS: managers only
ALTER TABLE proposal_slide_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE proposal_slide_zones ENABLE ROW LEVEL SECURITY;
ALTER TABLE deal_proposal_slides ENABLE ROW LEVEL SECURITY;
ALTER TABLE deal_proposal_zone_content ENABLE ROW LEVEL SECURITY;

CREATE POLICY "authenticated read templates" ON proposal_slide_templates FOR SELECT TO authenticated USING (true);
CREATE POLICY "manager write templates" ON proposal_slide_templates FOR ALL TO authenticated USING (true);
CREATE POLICY "authenticated read zones" ON proposal_slide_zones FOR SELECT TO authenticated USING (true);
CREATE POLICY "manager write zones" ON proposal_slide_zones FOR ALL TO authenticated USING (true);
CREATE POLICY "authenticated read proposal slides" ON deal_proposal_slides FOR SELECT TO authenticated USING (true);
CREATE POLICY "authenticated write proposal slides" ON deal_proposal_slides FOR ALL TO authenticated USING (true);
CREATE POLICY "authenticated read zone content" ON deal_proposal_zone_content FOR SELECT TO authenticated USING (true);
CREATE POLICY "authenticated write zone content" ON deal_proposal_zone_content FOR ALL TO authenticated USING (true);
