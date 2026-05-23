import type Database from 'better-sqlite3';
import { computeStreaks } from './engine.js';
import type { StreakConfig } from './engine.js';
import { getAllHolders, getTransfersForWallet, replaceStreaksForWallet } from '../db/queries.js';
import { logger } from '../shared/logger.js';

export interface RunStreakOptions {
  db: Database.Database;
  config: StreakConfig;
}

/**
 * Runs the streak engine over all wallets in the holders table.
 * For each wallet: fetches transfers, recomputes full streak history, replaces DB rows.
 * Idempotent — safe to re-run after new transfers are ingested.
 */
export async function runStreakEngine(opts: RunStreakOptions): Promise<void> {
  const { db, config } = opts;
  const wallets = getAllHolders(db).map((h) => h.wallet);

  logger.info({ walletCount: wallets.length, strictMode: config.strictMode }, 'Running streak engine');

  let processed = 0;
  for (const wallet of wallets) {
    const transfers = getTransfersForWallet(db, wallet);
    const records = computeStreaks(wallet, transfers, config);
    replaceStreaksForWallet(db, wallet, records);
    processed++;
    if (processed % 500 === 0 || processed === wallets.length) {
      logger.info({ processed, total: wallets.length }, 'Streak engine progress');
    }
  }

  logger.info({ processed }, 'Streak engine complete');
}
