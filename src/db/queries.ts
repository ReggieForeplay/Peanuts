import Database from 'better-sqlite3';
import type {
  MintInfoRow,
  HolderRow,
  RawTransactionRow,
  TransferRow,
  CursorRow,
  SnapshotLogRow,
} from '../shared/types.js';

// ─── Mint Info ──────────────────────────────────────────────────────────────

export function upsertMintInfo(db: Database.Database, row: MintInfoRow): void {
  db.prepare(`
    INSERT INTO mint_info (mint_address, decimals, symbol, name, total_supply, updated_at)
    VALUES (@mint_address, @decimals, @symbol, @name, @total_supply, @updated_at)
    ON CONFLICT(mint_address) DO UPDATE SET
      decimals    = excluded.decimals,
      symbol      = excluded.symbol,
      name        = excluded.name,
      total_supply = excluded.total_supply,
      updated_at  = excluded.updated_at
  `).run({ ...row, total_supply: row.total_supply.toString() });
}

export function getMintInfo(db: Database.Database, mint: string): MintInfoRow | undefined {
  const row = db
    .prepare('SELECT * FROM mint_info WHERE mint_address = ?')
    .get(mint) as (Omit<MintInfoRow, 'total_supply'> & { total_supply: string }) | undefined;
  if (!row) return undefined;
  return { ...row, total_supply: BigInt(row.total_supply) };
}

// ─── Holders ────────────────────────────────────────────────────────────────

export function upsertHolder(db: Database.Database, row: HolderRow): void {
  db.prepare(`
    INSERT INTO holders (wallet, balance, token_account, snapshot_slot, snapshot_time)
    VALUES (@wallet, @balance, @token_account, @snapshot_slot, @snapshot_time)
    ON CONFLICT(wallet) DO UPDATE SET
      balance       = excluded.balance,
      token_account = excluded.token_account,
      snapshot_slot = excluded.snapshot_slot,
      snapshot_time = excluded.snapshot_time
  `).run({ ...row, balance: row.balance.toString() });
}

export function getAllHolders(db: Database.Database): HolderRow[] {
  const rows = db.prepare('SELECT * FROM holders').all() as (Omit<HolderRow, 'balance'> & {
    balance: string;
  })[];
  return rows.map((r) => ({ ...r, balance: BigInt(r.balance) }));
}

export function getHolderWallets(db: Database.Database): string[] {
  return (db.prepare('SELECT wallet FROM holders').all() as { wallet: string }[]).map(
    (r) => r.wallet,
  );
}

// ─── Raw Transactions ────────────────────────────────────────────────────────

export function upsertRawTransaction(db: Database.Database, row: RawTransactionRow): void {
  db.prepare(`
    INSERT OR IGNORE INTO raw_transactions (signature, slot, block_time, raw_json)
    VALUES (@signature, @slot, @block_time, @raw_json)
  `).run(row);
}

export function getRawTransaction(
  db: Database.Database,
  signature: string,
): RawTransactionRow | undefined {
  return db
    .prepare('SELECT * FROM raw_transactions WHERE signature = ?')
    .get(signature) as RawTransactionRow | undefined;
}

// ─── Transfers ───────────────────────────────────────────────────────────────

export function insertTransfer(db: Database.Database, row: Omit<TransferRow, 'id'>): void {
  db.prepare(`
    INSERT OR IGNORE INTO transfers
      (signature, slot, block_time, wallet, direction, amount, counterparty, classification)
    VALUES
      (@signature, @slot, @block_time, @wallet, @direction, @amount, @counterparty, @classification)
  `).run({ ...row, amount: row.amount.toString() });
}

export function getTransfersForWallet(db: Database.Database, wallet: string): TransferRow[] {
  const rows = db
    .prepare(
      'SELECT * FROM transfers WHERE wallet = ? ORDER BY block_time ASC, id ASC',
    )
    .all(wallet) as (Omit<TransferRow, 'amount'> & { amount: string })[];
  return rows.map((r) => ({ ...r, amount: BigInt(r.amount) }));
}

// ─── Ingestion Cursors ───────────────────────────────────────────────────────

export function upsertCursor(
  db: Database.Database,
  wallet: string,
  lastSignature: string | null,
  fullyIngested: boolean,
): void {
  db.prepare(`
    INSERT INTO ingestion_cursors (wallet, last_signature, fully_ingested, updated_at)
    VALUES (@wallet, @last_signature, @fully_ingested, @updated_at)
    ON CONFLICT(wallet) DO UPDATE SET
      last_signature = excluded.last_signature,
      fully_ingested = excluded.fully_ingested,
      updated_at     = excluded.updated_at
  `).run({
    wallet,
    last_signature: lastSignature,
    fully_ingested: fullyIngested ? 1 : 0,
    updated_at: Math.floor(Date.now() / 1000),
  });
}

export function getCursor(db: Database.Database, wallet: string): CursorRow | undefined {
  return db
    .prepare('SELECT * FROM ingestion_cursors WHERE wallet = ?')
    .get(wallet) as CursorRow | undefined;
}

export function getPendingWallets(db: Database.Database): string[] {
  return (
    db
      .prepare(
        `SELECT w.wallet FROM holders w
         LEFT JOIN ingestion_cursors c ON c.wallet = w.wallet
         WHERE c.wallet IS NULL OR c.fully_ingested = 0`,
      )
      .all() as { wallet: string }[]
  ).map((r) => r.wallet);
}

// ─── Snapshot Log ─────────────────────────────────────────────────────────────

export function insertSnapshotLog(db: Database.Database, row: Omit<SnapshotLogRow, 'id'>): void {
  db.prepare(`
    INSERT INTO snapshot_log (taken_at, mint_address, holder_count, total_supply)
    VALUES (@taken_at, @mint_address, @holder_count, @total_supply)
  `).run({ ...row, total_supply: row.total_supply.toString() });
}

export function getSnapshotLogs(db: Database.Database): SnapshotLogRow[] {
  const rows = db
    .prepare('SELECT * FROM snapshot_log ORDER BY taken_at DESC')
    .all() as (Omit<SnapshotLogRow, 'total_supply'> & { total_supply: string })[];
  return rows.map((r) => ({ ...r, total_supply: BigInt(r.total_supply) }));
}
