#!/usr/bin/env tsx
/**
 * Runs the full Phase 1–3 pipeline on synthetic data.
 * Creates a fresh in-memory-style DB, generates wallets, computes streaks, calculates payouts.
 */
import { openMemoryDb } from '../src/db/client.js';
import { runMigrations } from '../src/db/schema.js';
import { runSimulator } from '../src/simulator/index.js';
import { runStreakEngine } from '../src/streak/index.js';
import { runCalculator } from '../src/calculator/index.js';
import { logger } from '../src/shared/logger.js';

const db = openMemoryDb();
runMigrations(db);

logger.info('Running simulator with synthetic holder data…');
runSimulator({ db, days: 30, seed: 42 });

logger.info('Running streak engine on simulated data…');
await runStreakEngine({
  db,
  config: { dustThreshold: 1000n, strictMode: false, computedAt: 1700000000 + 30 * 86400 },
});

logger.info('Computing distribution…');
await runCalculator({
  db,
  config: {
    poolLamports: 1_000_000_000n, // 1 SOL
    topN: 10,
    curve: 'proportional',
    minStreakAgeSecs: 0,
    minBalance: 0n,
    maxPayoutShare: 0.5,
    dustThreshold: 1000n,
    computedAt: 1700000000 + 30 * 86400,
  },
});
