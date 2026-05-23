-- Executed payout records (immutable after execution, one row per transfer)
CREATE TABLE IF NOT EXISTS executed_payouts (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  plan_id      INTEGER NOT NULL REFERENCES distribution_plans(id),
  wallet       TEXT NOT NULL,
  rank         INTEGER NOT NULL,
  amount_lamports INTEGER NOT NULL,
  tx_signature TEXT,             -- Solana tx signature (NULL until confirmed)
  status       TEXT NOT NULL CHECK(status IN ('PENDING','CONFIRMED','FAILED')) DEFAULT 'PENDING',
  executed_at  INTEGER NOT NULL,
  confirmed_at INTEGER,
  UNIQUE(plan_id, wallet)       -- idempotency: can't double-pay same wallet in same plan
);

CREATE INDEX IF NOT EXISTS idx_payouts_plan ON executed_payouts(plan_id);
CREATE INDEX IF NOT EXISTS idx_payouts_wallet ON executed_payouts(wallet);
