-- Global defaults for questionnaires (singleton row, id always = 1)
create table questionnaire_defaults (
  id      int primary key default 1 check (id = 1),
  intro_text text,
  updated_at timestamptz default now()
);

-- Seed with the current standard intro text
insert into questionnaire_defaults (id, intro_text) values (1,
  '<p>To help us build the most accurate proposal for your streaming and OTT needs, please take a few minutes to answer the questions below. The more detail you can share, the better we can tailor our recommendations.</p><p>A few things to know before you begin:</p><ul><li><strong>Your answers save automatically</strong> — feel free to close the form and return at any time using this same link.</li><li><strong>This link can be shared</strong> — if multiple people on your team have relevant context, they can open the form simultaneously and fill in their sections.</li><li><strong>Nothing is final until you hit Submit</strong> — once you''re done, our team will be notified and we''ll follow up shortly.</li></ul><p>If any question is unclear or doesn''t apply, just leave a brief note in the field and we''ll sort it out together.</p>'
);
