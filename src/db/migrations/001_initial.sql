-- Mint metadata
CREATE TABLE IF NOT EXISTS mint_info (
  mint_address  TEXT PRIMARY KEY,
  decimals      INTEGER NOT NULL,
  symbol        TEXT,
  name          TEXT,
  total_supply  INTEGER NOT NULL,
  updated_at    INTEGER NOT NULL
);

-- Schema migrations tracker
CREATE TABLE IF NOT EXISTS schema_migrations (
  filename   TEXT PRIMARY KEY,
  applied_at INTEGER NOT NULL
);

-- Full raw Helius enhanced TX blobs — one row per signature (audit trail)
-- transfers rows reference this table; raw JSON is NOT duplicated per-transfer row
CREATE TABLE IF NOT EXISTS raw_transactions (
  signature  TEXT PRIMARY KEY,
  slot       INTEGER NOT NULL,
  block_time INTEGER NOT NULL,
  raw_json   TEXT NOT NULL
);

-- Current holder snapshot (upserted on each ingestion run)
CREATE TABLE IF NOT EXISTS holders (
  wallet         TEXT PRIMARY KEY,
  balance        INTEGER NOT NULL,
  token_account  TEXT NOT NULL,
  snapshot_slot  INTEGER NOT NULL,
  snapshot_time  INTEGER NOT NULL
);

-- Wallet-centric transfer event log (append-only)
-- One row per (signature, wallet, direction) — idempotent via UNIQUE constraint
CREATE TABLE IF NOT EXISTS transfers (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  signature       TEXT NOT NULL REFERENCES raw_transactions(signature),
  slot            INTEGER NOT NULL,
  block_time      INTEGER NOT NULL,
  wallet          TEXT NOT NULL,
  direction       TEXT NOT NULL CHECK(direction IN ('INBOUND','OUTBOUND')),
  amount          INTEGER NOT NULL,
  counterparty    TEXT,
  classification  TEXT CHECK(classification IN ('BUY','PLAIN_RECEIVE','SELL','PLAIN_TRANSFER'))
  -- UNIQUE(signature, wallet, direction) defined separately for clarity
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_transfers_sig_wallet_dir
  ON transfers(signature, wallet, direction);

-- Ingestion cursor per wallet (for resumable pagination)
CREATE TABLE IF NOT EXISTS ingestion_cursors (
  wallet          TEXT PRIMARY KEY,
  last_signature  TEXT,
  fully_ingested  INTEGER NOT NULL DEFAULT 0,
  updated_at      INTEGER NOT NULL
);

-- Immutable snapshot audit log (one row per ingestion run)
CREATE TABLE IF NOT EXISTS snapshot_log (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  taken_at      INTEGER NOT NULL,
  mint_address  TEXT NOT NULL,
  holder_count  INTEGER NOT NULL,
  total_supply  INTEGER NOT NULL
);
