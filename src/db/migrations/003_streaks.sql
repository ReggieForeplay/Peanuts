-- Streak history: one row per streak period per wallet (append-style, fully auditable)
-- Recomputing a wallet deletes+reinserts its rows — always derivable from transfers table.
CREATE TABLE IF NOT EXISTS streaks (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  wallet       TEXT NOT NULL,
  streak_start INTEGER NOT NULL,   -- block_time of first qualifying INBOUND (unix seconds)
  streak_end   INTEGER,            -- block_time when broken (NULL = still ACTIVE)
  break_reason TEXT CHECK(break_reason IN ('SELL','STRICT_OUTBOUND','DUST_THRESHOLD')),
  status       TEXT NOT NULL CHECK(status IN ('ACTIVE','BROKEN')) DEFAULT 'ACTIVE',
  peak_balance INTEGER NOT NULL DEFAULT 0,
  computed_at  INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_streaks_wallet        ON streaks(wallet, streak_start DESC);
CREATE INDEX IF NOT EXISTS idx_streaks_active        ON streaks(status, streak_start ASC)
  WHERE status = 'ACTIVE';
