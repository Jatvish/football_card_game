CREATE TABLE IF NOT EXISTS fw_accounts (
  id BIGSERIAL PRIMARY KEY,
  username VARCHAR(18) NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS fw_sessions (
  token_hash CHAR(64) PRIMARY KEY,
  account_id BIGINT NOT NULL REFERENCES fw_accounts(id) ON DELETE CASCADE,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS fw_sessions_account_idx ON fw_sessions(account_id);
CREATE INDEX IF NOT EXISTS fw_sessions_expiry_idx ON fw_sessions(expires_at);

CREATE TABLE IF NOT EXISTS fw_ranked_profiles (
  account_id BIGINT PRIMARY KEY REFERENCES fw_accounts(id) ON DELETE CASCADE,
  xp INTEGER NOT NULL DEFAULT 0 CHECK (xp >= 0),
  rating INTEGER NOT NULL DEFAULT 1000 CHECK (rating >= 0),
  wins INTEGER NOT NULL DEFAULT 0 CHECK (wins >= 0),
  losses INTEGER NOT NULL DEFAULT 0 CHECK (losses >= 0),
  streak INTEGER NOT NULL DEFAULT 0 CHECK (streak >= 0),
  best_streak INTEGER NOT NULL DEFAULT 0 CHECK (best_streak >= 0),
  packs INTEGER NOT NULL DEFAULT 0 CHECK (packs >= 0),
  squad JSONB NOT NULL DEFAULT '[]'::jsonb,
  achievements JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS fw_cards (
  account_id BIGINT NOT NULL REFERENCES fw_accounts(id) ON DELETE CASCADE,
  card_id VARCHAR(12) NOT NULL,
  source VARCHAR(32) NOT NULL DEFAULT 'reward',
  unlocked_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY(account_id,card_id)
);
CREATE INDEX IF NOT EXISTS fw_cards_card_idx ON fw_cards(card_id);

CREATE TABLE IF NOT EXISTS fw_daily_progress (
  account_id BIGINT NOT NULL REFERENCES fw_accounts(id) ON DELETE CASCADE,
  day DATE NOT NULL DEFAULT current_date,
  matches INTEGER NOT NULL DEFAULT 0,
  wins INTEGER NOT NULL DEFAULT 0,
  goals INTEGER NOT NULL DEFAULT 0,
  midfielder_goals INTEGER NOT NULL DEFAULT 0,
  defensive_stops INTEGER NOT NULL DEFAULT 0,
  spin_claimed BOOLEAN NOT NULL DEFAULT false,
  spin_result JSONB,
  claimed_missions JSONB NOT NULL DEFAULT '[]'::jsonb,
  PRIMARY KEY(account_id,day)
);

CREATE TABLE IF NOT EXISTS fw_ranked_matches (
  account_id BIGINT NOT NULL REFERENCES fw_accounts(id) ON DELETE CASCADE,
  match_id VARCHAR(128) NOT NULL,
  won BOOLEAN NOT NULL,
  score_for INTEGER NOT NULL,
  score_against INTEGER NOT NULL,
  goals INTEGER NOT NULL DEFAULT 0,
  midfielder_goals INTEGER NOT NULL DEFAULT 0,
  defensive_stops INTEGER NOT NULL DEFAULT 0,
  mvp_card_id VARCHAR(12),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY(account_id,match_id)
);
CREATE INDEX IF NOT EXISTS fw_ranked_matches_week_idx ON fw_ranked_matches(created_at DESC);


-- Per-card mastery is earned only in Ranked matches and follows the user's account.
CREATE TABLE IF NOT EXISTS fw_card_mastery (
  account_id BIGINT NOT NULL REFERENCES fw_accounts(id) ON DELETE CASCADE,
  card_id VARCHAR(12) NOT NULL,
  xp INTEGER NOT NULL DEFAULT 0 CHECK (xp >= 0),
  appearances INTEGER NOT NULL DEFAULT 0 CHECK (appearances >= 0),
  goals INTEGER NOT NULL DEFAULT 0 CHECK (goals >= 0),
  defensive_stops INTEGER NOT NULL DEFAULT 0 CHECK (defensive_stops >= 0),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY(account_id,card_id)
);
CREATE INDEX IF NOT EXISTS fw_card_mastery_card_idx ON fw_card_mastery(card_id);