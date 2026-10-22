ALTER TABLE conversation_sessions ADD COLUMN resolved_at TIMESTAMPTZ;
ALTER TABLE conversation_sessions ADD COLUMN bot_released_at TIMESTAMPTZ;
