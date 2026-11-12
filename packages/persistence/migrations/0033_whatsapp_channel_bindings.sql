-- Operator-AI pass: declarative WhatsApp channel bindings (GOAL_PLAN §5).
-- The number is REGISTERED here in a disabled state purely as configuration
-- truth; nothing activates until Meta/Zammad onboarding completes and the
-- controlled release enables the bot. Additive only.
-- Rollback: DROP TABLE whatsapp_channel_bindings (nothing references it).

CREATE TABLE whatsapp_channel_bindings (
  id TEXT PRIMARY KEY,
  provider TEXT NOT NULL DEFAULT 'meta-cloud-api',
  phone_e164 TEXT NOT NULL,
  waba_id TEXT,
  zammad_channel_id TEXT,
  exclusive_writer TEXT NOT NULL DEFAULT 'zammad',
  status TEXT NOT NULL DEFAULT 'disabled' CHECK (status IN ('registered','staged','disabled')),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX whatsapp_channel_bindings_phone ON whatsapp_channel_bindings (provider, phone_e164);
