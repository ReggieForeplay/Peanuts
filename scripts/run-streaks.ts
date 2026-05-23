#!/usr/bin/env tsx
import 'dotenv/config';
import { openDb } from '../src/db/client.js';
import { runMigrations } from '../src/db/schema.js';
import { runStreakEngine } from '../src/streak/index.js';
import { logger } from '../src/shared/logger.js';
import { getConfig } from '../src/shared/config.js';

const config = getConfig();
const db = openDb(config.dbPath);
runMigrations(db);

const strictMode = process.argv.includes('--strict');
const dustThreshold = BigInt(process.env.DUST_THRESHOLD ?? '1000');

await runStreakEngine({
  db,
  config: {
    dustThreshold,
    strictMode,
    computedAt: Math.floor(Date.now() / 1000),
  },
});

db.close();
logger.info('Done');
