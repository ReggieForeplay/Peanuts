#!/usr/bin/env tsx
/**
 * $PEANUTS — Phase 1 ingestion entry point
 *
 * Usage:
 *   npm run ingest
 *   npm run ingest -- --force   (re-ingest wallets already marked complete)
 *
 * Requires .env with HELIUS_API_KEY and TOKEN_MINT_ADDRESS set.
 */
import 'dotenv/config';
import { openDb } from '../src/db/client.js';
import { runMigrations } from '../src/db/schema.js';
import { runIngestion } from '../src/ingester/index.js';
import { logger } from '../src/shared/logger.js';
import { getConfig } from '../src/shared/config.js';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DEX_PROGRAMS_PATH = path.join(__dirname, '../config/dex-programs.json');

async function main() {
  const force = process.argv.includes('--force');

  const config = getConfig();
  const db = openDb(config.dbPath);

  logger.info({ dbPath: config.dbPath }, 'Opening database');
  runMigrations(db);

  const { default: dexPrograms } = await import(DEX_PROGRAMS_PATH, { with: { type: 'json' } });

  await runIngestion({
    db,
    dasUrl: config.heliusDasUrl,
    enhancedBaseUrl: config.heliusEnhancedUrl,
    apiKey: config.heliusApiKey,
    mint: config.mintAddress,
    dexPrograms,
    concurrency: config.concurrency,
    rateLimitRps: config.rateLimitRps,
    force,
  });

  db.close();
  logger.info('Done');
}

main().catch((err) => {
  logger.error(err, 'Ingestion failed');
  process.exit(1);
});
