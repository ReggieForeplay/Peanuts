-- Distribution plans (one per payout run, never mutated after creation)
CREATE TABLE IF NOT EXISTS distribution_plans (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  created_at       INTEGER NOT NULL,
  pool_lamports    INTEGER NOT NULL,
  top_n            INTEGER NOT NULL,
  curve            TEXT NOT NULL CHECK(curve IN ('proportional','linear')),
  config_json      TEXT NOT NULL,   -- full DistributionConfig snapshot for audit
  recipient_count  INTEGER NOT NULL,
  total_payout     INTEGER NOT NULL, -- must equal pool_lamports
  dust_lamports    INTEGER NOT NULL DEFAULT 0,
  plan_hash        TEXT NOT NULL,    -- SHA256 of the entries for tamper detection
  status           TEXT NOT NULL CHECK(status IN ('DRAFT','APPROVED','EXECUTED')) DEFAULT 'DRAFT'
);

-- Individual payout entries for a plan
CREATE TABLE IF NOT EXISTS distribution_entries (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  plan_id          INTEGER NOT NULL REFERENCES distribution_plans(id),
  wallet           TEXT NOT NULL,
  rank             INTEGER NOT NULL,
  streak_start     INTEGER NOT NULL,
  streak_duration  INTEGER NOT NULL,  -- seconds
  weight           REAL NOT NULL,
  payout_lamports  INTEGER NOT NULL,
  UNIQUE(plan_id, wallet)
);

CREATE INDEX IF NOT EXISTS idx_dist_entries_plan ON distribution_entries(plan_id, rank ASC);
