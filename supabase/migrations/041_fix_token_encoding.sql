-- Fix: PostgreSQL <17 does not support encode(..., 'base64url')
-- Replace the broken default with a hex-based fallback.
-- Application code (QuestionnaireBuilder.jsx) always supplies the token
-- explicitly, so this default is only a safety net.
alter table questionnaires
  alter column token set default encode(gen_random_bytes(24), 'hex');
