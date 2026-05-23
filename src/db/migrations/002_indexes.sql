-- Hot path for Phase 2 streak engine: all transfers for a wallet in time order
CREATE INDEX IF NOT EXISTS idx_transfers_wallet_time
  ON transfers(wallet, block_time ASC);

-- Filter by direction within a wallet's history (find last OUTBOUND sell)
CREATE INDEX IF NOT EXISTS idx_transfers_wallet_dir_time
  ON transfers(wallet, direction, block_time ASC);

-- Find earliest BUY per wallet (streak start anchor)
CREATE INDEX IF NOT EXISTS idx_transfers_wallet_class_time
  ON transfers(wallet, classification, block_time ASC);

-- Slot range scans for audit replay
CREATE INDEX IF NOT EXISTS idx_raw_tx_slot
  ON raw_transactions(slot);

-- Chronological snapshot audit
CREATE INDEX IF NOT EXISTS idx_snapshot_log_taken_at
  ON snapshot_log(taken_at DESC);
