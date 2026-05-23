#!/usr/bin/env tsx
import 'dotenv/config';
import { openDb } from '../src/db/client.js';
import { runMigrations } from '../src/db/schema.js';
import { startServer } from '../src/api/index.js';
import { getConfig } from '../src/shared/config.js';
import { logger } from '../src/shared/logger.js';

const config = getConfig();
const db = openDb(config.dbPath);
runMigrations(db);
logger.info({ dbPath: config.dbPath }, 'Database ready');

await startServer(db, config.apiPort);
