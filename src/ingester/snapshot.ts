import type Database from 'better-sqlite3';
import { paginateTokenAccounts, getMintMetadata } from './das-client.js';
import type { RateLimiter } from '../shared/rate-limiter.js';
import { upsertHolder, upsertMintInfo, insertSnapshotLog } from '../db/queries.js';
import { logger } from '../shared/logger.js';
import type { SnapshotResult } from '../shared/types.js';

/**
 * Enumerates all current token holders for a mint and persists them to SQLite.
 * Also fetches mint metadata (decimals, name, symbol, supply).
 *
 * The holders table is a full upsert — existing wallets get their balances updated,
 * wallets that dropped to zero are NOT removed (history is preserved; Phase 2 will
 * handle holders whose balance has dropped since last snapshot).
 */
export async function runSnapshot(
  db: Database.Database,
  dasUrl: string,
  mint: string,
  limiter: RateLimiter,
): Promise<SnapshotResult> {
  const snapshotTime = Math.floor(Date.now() / 1000);

  logger.info({ mint }, 'Starting holder snapshot');

  // Fetch mint metadata first
  const meta = await getMintMetadata(dasUrl, mint, limiter);
  logger.info({ mint, decimals: meta.decimals, symbol: meta.symbol }, 'Mint metadata fetched');

  upsertMintInfo(db, {
    mint_address: mint,
    decimals: meta.decimals,
    symbol: meta.symbol ?? null,
    name: meta.name ?? null,
    total_supply: BigInt(meta.supply ?? '0'),
    updated_at: snapshotTime,
  });

  // Enumerate holders page by page, upsert in batches inside transactions
  let holderCount = 0;
  let snapshotSlot = 0;

  for await (const page of paginateTokenAccounts(dasUrl, mint, limiter)) {
    const upsertBatch = db.transaction((accounts: typeof page) => {
      for (const account of accounts) {
        const balance = BigInt(account.amount);
        if (balance === 0n) continue; // filter zero-balance accounts

        upsertHolder(db, {
          wallet: account.owner,
          balance,
          token_account: account.address,
          snapshot_slot: snapshotSlot,
          snapshot_time: snapshotTime,
        });
        holderCount++;
      }
    });

    upsertBatch(page);
    logger.debug({ holderCount }, 'Snapshot page processed');
  }

  // Insert snapshot log entry (immutable audit trail)
  const mintInfo = { total_supply: BigInt(meta.supply ?? '0') };
  insertSnapshotLog(db, {
    taken_at: snapshotTime,
    mint_address: mint,
    holder_count: holderCount,
    total_supply: mintInfo.total_supply,
  });

  logger.info({ mint, holderCount, snapshotTime }, 'Snapshot complete');

  return { holderCount, totalSupply: mintInfo.total_supply, snapshotTime };
}
