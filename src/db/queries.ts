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

// ─── Streaks ─────────────────────────────────────────────────────────────────

import type { StreakRecord } from '../streak/engine.js';

export function replaceStreaksForWallet(
  db: Database.Database,
  wallet: string,
  records: StreakRecord[],
): void {
  db.transaction(() => {
    db.prepare('DELETE FROM streaks WHERE wallet = ?').run(wallet);
    const insert = db.prepare(`
      INSERT INTO streaks
        (wallet, streak_start, streak_end, break_reason, status, peak_balance, computed_at)
      VALUES
        (@wallet, @streak_start, @streak_end, @break_reason, @status, @peak_balance, @computed_at)
    `);
    for (const r of records) {
      insert.run({ ...r, peak_balance: r.peak_balance.toString() });
    }
  })();
}

export function getActiveStreaks(db: Database.Database): Array<StreakRecord & { streak_duration: number }> {
  const rows = db.prepare(`
    SELECT *, (computed_at - streak_start) AS streak_duration
    FROM streaks
    WHERE status = 'ACTIVE'
    ORDER BY streak_duration DESC
  `).all() as Array<StreakRecord & { streak_duration: number; peak_balance: string }>;
  return rows.map((r) => ({ ...r, peak_balance: BigInt(r.peak_balance) }));
}

export function getStreaksForWallet(db: Database.Database, wallet: string): StreakRecord[] {
  const rows = db.prepare(`
    SELECT * FROM streaks WHERE wallet = ? ORDER BY streak_start DESC
  `).all(wallet) as Array<StreakRecord & { peak_balance: string }>;
  return rows.map((r) => ({ ...r, peak_balance: BigInt(r.peak_balance) }));
}

// ─── Distribution Plans ───────────────────────────────────────────────────────

import type { DistributionPlan, DistributionEntry } from '../calculator/engine.js';

export function insertDistributionPlan(
  db: Database.Database,
  plan: DistributionPlan,
): number {
  const result = db.transaction(() => {
    const planRow = db.prepare(`
      INSERT INTO distribution_plans
        (created_at, pool_lamports, top_n, curve, config_json,
         recipient_count, total_payout, dust_lamports, plan_hash, status)
      VALUES
        (@created_at, @pool_lamports, @top_n, @curve, @config_json,
         @recipient_count, @total_payout, @dust_lamports, @plan_hash, 'DRAFT')
    `).run({
      created_at: plan.config.computedAt,
      pool_lamports: plan.config.poolLamports.toString(),
      top_n: plan.config.topN,
      curve: plan.config.curve,
      config_json: JSON.stringify(plan.config, (_, v) =>
        typeof v === 'bigint' ? v.toString() : v,
      ),
      recipient_count: plan.entries.length,
      total_payout: plan.totalPayout.toString(),
      dust_lamports: plan.dustLamports.toString(),
      plan_hash: plan.planHash,
    });

    const planId = planRow.lastInsertRowid as number;
    const insertEntry = db.prepare(`
      INSERT INTO distribution_entries
        (plan_id, wallet, rank, streak_start, streak_duration, weight, payout_lamports)
      VALUES
        (@plan_id, @wallet, @rank, @streak_start, @streak_duration, @weight, @payout_lamports)
    `);
    for (const e of plan.entries) {
      insertEntry.run({
        plan_id: planId,
        wallet: e.wallet,
        rank: e.rank,
        streak_start: e.streakStart,
        streak_duration: e.streakDuration,
        weight: e.weight,
        payout_lamports: e.payoutLamports.toString(),
      });
    }
    return planId;
  })();
  return result as number;
}

export function getDistributionPlan(
  db: Database.Database,
  planId: number,
): { plan: Record<string, unknown>; entries: DistributionEntry[] } | undefined {
  const plan = db.prepare('SELECT * FROM distribution_plans WHERE id = ?').get(planId);
  if (!plan) return undefined;
  const entries = (
    db
      .prepare('SELECT * FROM distribution_entries WHERE plan_id = ? ORDER BY rank ASC')
      .all(planId) as Array<Record<string, unknown>>
  ).map((e) => ({ ...e, payoutLamports: BigInt(e.payout_lamports as string) })) as unknown as DistributionEntry[];
  return { plan: plan as Record<string, unknown>, entries };
}
