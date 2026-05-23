import type Database from 'better-sqlite3';
import pLimit from 'p-limit';
import { runSnapshot } from './snapshot.js';
import { ingestWalletHistory } from './history.js';
import { createRateLimiter } from '../shared/rate-limiter.js';
import type { DexProgramsConfig } from '../shared/types.js';
import { getHolderWallets, getPendingWallets } from '../db/queries.js';
import { logger } from '../shared/logger.js';

export interface IngestionOptions {
  db: Database.Database;
  dasUrl: string;
  enhancedBaseUrl: string;
  apiKey: string;
  mint: string;
  dexPrograms: DexProgramsConfig;
  concurrency?: number;
  rateLimitRps?: number;
  /** If true, re-ingest wallets already marked fully_ingested */
  force?: boolean;
}

/**
 * Main ingestion orchestrator.
 *
 * Flow:
 * 1. Run holder snapshot (upserts current balances + mint info)
 * 2. Determine which wallets still need history fetching
 * 3. Fan out wallet history ingestion with concurrency + rate-limit controls
 *
 * Fully idempotent: safe to re-run at any time. New holders from a fresh snapshot
 * are automatically picked up. Wallets with fully_ingested=1 are skipped unless --force.
 */
export async function runIngestion(opts: IngestionOptions): Promise<void> {
  const {
    db,
    dasUrl,
    enhancedBaseUrl,
    apiKey,
    mint,
    dexPrograms,
    concurrency = 3,
    rateLimitRps = 10,
    force = false,
  } = opts;

  const startTime = Date.now();
  logger.info({ mint, concurrency, rateLimitRps, force }, 'Starting ingestion run');

  // Step 1: Snapshot current holders
  const snapshot = await runSnapshot(db, dasUrl, mint, createRateLimiter({ requestsPerSecond: rateLimitRps, concurrency: 1 }));
  logger.info(snapshot, 'Snapshot complete');

  // Step 2: Determine wallets needing history ingestion
  const wallets = force ? getHolderWallets(db) : getPendingWallets(db);
  logger.info({ total: wallets.length, force }, 'Wallets queued for history ingestion');

  if (wallets.length === 0) {
    logger.info('All wallets fully ingested — nothing to do');
    return;
  }

  // Step 3: Fan out with concurrency control and shared rate limiter
  const limiter = createRateLimiter({ requestsPerSecond: rateLimitRps, concurrency });
  const concurrencyLimit = pLimit(concurrency);
  let completed = 0;
  let failed = 0;

  const tasks = wallets.map((wallet) =>
    concurrencyLimit(async () => {
      try {
        await ingestWalletHistory({ db, enhancedBaseUrl, apiKey, wallet, mint, dexPrograms, limiter });
        completed++;
        if (completed % 50 === 0 || completed === wallets.length) {
          logger.info({ completed, failed, total: wallets.length }, 'Ingestion progress');
        }
      } catch (err) {
        failed++;
        logger.error({ wallet, err }, 'Failed to ingest wallet history — skipping');
      }
    }),
  );

  await Promise.all(tasks);

  const elapsedSec = ((Date.now() - startTime) / 1000).toFixed(1);
  logger.info({ completed, failed, total: wallets.length, elapsedSec }, 'Ingestion run complete');
}
