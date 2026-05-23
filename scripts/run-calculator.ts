#!/usr/bin/env tsx
import 'dotenv/config';
import { openDb } from '../src/db/client.js';
import { runMigrations } from '../src/db/schema.js';
import { runCalculator } from '../src/calculator/index.js';
import { logger } from '../src/shared/logger.js';
import { getConfig } from '../src/shared/config.js';
import path from 'path';

const config = getConfig();
const db = openDb(config.dbPath);
runMigrations(db);

const poolSol = parseFloat(process.env.POOL_SOL ?? '1.0');
const poolLamports = BigInt(Math.round(poolSol * 1e9));
const outputDir = './data/plans';
const outputPath = path.join(outputDir, `plan_${Date.now()}.json`);

const planId = await runCalculator({
  db,
  config: {
    poolLamports,
    topN: Number(process.env.TOP_N ?? '10'),
    curve: (process.env.CURVE ?? 'proportional') as 'proportional' | 'linear',
    minStreakAgeSecs: Number(process.env.MIN_STREAK_AGE_SECS ?? String(7 * 86400)),
    minBalance: BigInt(process.env.MIN_BALANCE ?? '1000'),
    maxPayoutShare: parseFloat(process.env.MAX_PAYOUT_SHARE ?? '0.5'),
    dustThreshold: BigInt(process.env.DUST_THRESHOLD ?? '1000'),
    computedAt: Math.floor(Date.now() / 1000),
  },
  outputPath,
});

logger.info({ planId, outputPath }, 'Plan saved — review it before running executor');
db.close();
