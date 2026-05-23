import type Database from 'better-sqlite3';
import { paginateTransactionHistory } from './enhanced-client.js';
import { classifyTransaction } from './classify.js';
import type { RateLimiter } from '../shared/rate-limiter.js';
import type { DexProgramsConfig } from '../shared/types.js';
import {
  getCursor,
  upsertCursor,
  upsertRawTransaction,
  insertTransfer,
} from '../db/queries.js';
import { logger } from '../shared/logger.js';

export interface HistoryOptions {
  db: Database.Database;
  enhancedBaseUrl: string;
  apiKey: string;
  wallet: string;
  mint: string;
  dexPrograms: DexProgramsConfig;
  limiter: RateLimiter;
}

/**
 * Fetches and persists the full $PEANUTS transfer history for a single wallet.
 *
 * Idempotent and resumable:
 * - Reads the ingestion cursor to determine where to resume pagination.
 * - Cursor is committed after each page — a crash resumes from the last committed page.
 * - Uses INSERT OR IGNORE so re-running cannot produce duplicate transfers.
 * - Sets fully_ingested = true when the API returns an empty page (genesis reached).
 */
export async function ingestWalletHistory(opts: HistoryOptions): Promise<void> {
  const { db, enhancedBaseUrl, apiKey, wallet, mint, dexPrograms, limiter } = opts;

  const cursor = getCursor(db, wallet);

  if (cursor?.fully_ingested === 1) {
    logger.debug({ wallet }, 'Wallet already fully ingested — skipping');
    return;
  }

  // Resume from the oldest signature we've already processed (exclusive)
  const resumeFrom = cursor?.last_signature ?? null;
  logger.debug({ wallet, resumeFrom }, 'Ingesting wallet history');

  let pagesProcessed = 0;
  let transfersInserted = 0;

  for await (const page of paginateTransactionHistory(
    enhancedBaseUrl,
    apiKey,
    wallet,
    resumeFrom,
    limiter,
  )) {
    // Process the whole page inside a single SQLite transaction for speed + atomicity
    db.transaction(() => {
      for (const tx of page) {
        // Persist raw tx blob (INSERT OR IGNORE — idempotent)
        upsertRawTransaction(db, {
          signature: tx.signature,
          slot: tx.slot,
          block_time: tx.timestamp,
          raw_json: JSON.stringify(tx),
        });

        // Classify and insert each transfer involving this wallet
        const results = classifyTransaction({ tx, wallet, mint, dexPrograms });
        for (const result of results) {
          insertTransfer(db, {
            signature: tx.signature,
            slot: tx.slot,
            block_time: tx.timestamp,
            wallet,
            direction: result.direction,
            amount: result.amount,
            counterparty: result.counterparty,
            classification: result.classification,
          });
          transfersInserted++;
        }
      }

      // Update cursor to the oldest signature in this page
      const oldestSig = page[page.length - 1].signature;
      upsertCursor(db, wallet, oldestSig, false);
    })();

    pagesProcessed++;
    logger.debug({ wallet, pagesProcessed, transfersInserted }, 'History page committed');
  }

  // Mark wallet as fully ingested (empty page = reached genesis)
  const finalCursor = getCursor(db, wallet);
  upsertCursor(db, wallet, finalCursor?.last_signature ?? null, true);

  logger.info({ wallet, pagesProcessed, transfersInserted }, 'Wallet history ingestion complete');
}
