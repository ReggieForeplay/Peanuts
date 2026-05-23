import type Database from 'better-sqlite3';
import { computeDistribution } from './engine.js';
import type { DistributionConfig } from './engine.js';
import { getActiveStreaks } from '../db/queries.js';
import { insertDistributionPlan } from '../db/queries.js';
import { logger } from '../shared/logger.js';
import fs from 'fs';
import path from 'path';

export interface RunCalculatorOptions {
  db: Database.Database;
  config: DistributionConfig;
  outputPath?: string; // write plan JSON here if provided
}

export async function runCalculator(opts: RunCalculatorOptions): Promise<number> {
  const { db, config, outputPath } = opts;

  logger.info({ poolLamports: config.poolLamports.toString(), topN: config.topN }, 'Running distribution calculator');

  const activeStreaks = getActiveStreaks(db);
  logger.info({ eligible: activeStreaks.length }, 'Active streaks found');

  const holders = activeStreaks.map((s) => ({
    wallet: s.wallet,
    streakStart: s.streak_start,
    streakDuration: s.streak_duration,
    currentBalance: s.peak_balance,
  }));

  const plan = computeDistribution(holders, config);

  logger.info(
    {
      recipients: plan.entries.length,
      totalPayout: plan.totalPayout.toString(),
      dustLamports: plan.dustLamports.toString(),
      planHash: plan.planHash,
    },
    'Distribution plan computed',
  );

  plan.entries.forEach((e) => {
    logger.info(
      { rank: e.rank, wallet: e.wallet, streakDays: (e.streakDuration / 86400).toFixed(1), payout: e.payoutLamports.toString() },
      'Payout entry',
    );
  });

  const planId = insertDistributionPlan(db, plan);
  logger.info({ planId }, 'Plan saved to database');

  if (outputPath) {
    const json = JSON.stringify(
      { planId, ...plan, config: { ...plan.config, poolLamports: plan.config.poolLamports.toString() } },
      (_, v) => (typeof v === 'bigint' ? v.toString() : v),
      2,
    );
    fs.mkdirSync(path.dirname(outputPath), { recursive: true });
    fs.writeFileSync(outputPath, json, 'utf8');
    logger.info({ outputPath }, 'Plan written to file');
  }

  return planId;
}
