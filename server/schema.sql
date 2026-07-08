-- Echo Chamber D1 schema. Apply with:
--   npx wrangler d1 execute echo-chamber-db --file=schema.sql          (remote)
--   npx wrangler d1 execute echo-chamber-db --local --file=schema.sql (wrangler dev)
-- Day keys are the CLIENT's local date (YYYY-MM-DD) — the server never
-- computes "today" for game state, so timezones stay consistent per player.

CREATE TABLE IF NOT EXISTS users (
  uid TEXT PRIMARY KEY,
  created_at TEXT NOT NULL,
  streak INTEGER NOT NULL DEFAULT 0,
  last_streak_day TEXT
);

CREATE TABLE IF NOT EXISTS attempts (
  uid TEXT NOT NULL,
  day TEXT NOT NULL,
  clip_id TEXT NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0,
  best INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (uid, day, clip_id)
);

CREATE TABLE IF NOT EXISTS best_ever (
  uid TEXT NOT NULL,
  clip_id TEXT NOT NULL,
  best INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (uid, clip_id)
);

CREATE TABLE IF NOT EXISTS heard (
  uid TEXT NOT NULL,
  day TEXT NOT NULL,
  clip_id TEXT NOT NULL,
  PRIMARY KEY (uid, day, clip_id)
);

CREATE TABLE IF NOT EXISTS subscribers (
  email TEXT PRIMARY KEY,
  uid TEXT,
  token TEXT NOT NULL,
  created_at TEXT NOT NULL,
  unsubscribed INTEGER NOT NULL DEFAULT 0
);
