import { describe, it, expect, vi, beforeEach } from 'vitest';
import { openMemoryDb } from '../../src/db/client.js';
import { runMigrations } from '../../src/db/schema.js';
import { ingestWalletHistory } from '../../src/ingester/history.js';
import { getTransfersForWallet, getCursor, getRawTransaction } from '../../src/db/queries.js';
import type { RateLimiter } from '../../src/shared/rate-limiter.js';
import type { CursorRow, DexProgramsConfig } from '../../src/shared/types.js';
import type Database from 'better-sqlite3';
import p1Fixtures from '../fixtures/helius-enhanced-txs.json' with { type: 'json' };
import p2Fixtures from '../fixtures/helius-enhanced-txs-p2.json' with { type: 'json' };

const MINT = 'PEANUTS_MINT';
const WALLET = 'wallet_alice';

const dexPrograms: DexProgramsConfig = {
  sources: { RAYDIUM: 'Raydium', JUPITER: 'Jupiter', PUMP_FUN: 'Pump.fun' },
  programs: {
    '675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8': { name: 'Raydium AMM v4', source: 'RAYDIUM' },
    'JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4': { name: 'Jupiter v6', source: 'JUPITER' },
    '6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ35MKDxgznRY3': { name: 'Pump.fun', source: 'PUMP_FUN' },
  },
};

const mockLimiter: RateLimiter = { schedule: (fn) => fn() };

let db: Database.Database;

beforeEach(() => {
  db = openMemoryDb();
  runMigrations(db);
  vi.clearAllMocks();
});

vi.mock('../../src/ingester/enhanced-client.js', () => ({
  paginateTransactionHistory: vi.fn(),
}));

import * as enhancedClient from '../../src/ingester/enhanced-client.js';

// Filter fixtures to only those involving wallet_alice
const aliceTxsP1 = p1Fixtures.filter((tx) =>
  tx.tokenTransfers?.some(
    (t) => t.fromUserAccount === WALLET || t.toUserAccount === WALLET,
  ),
);

describe('ingestWalletHistory', () => {
  it('ingests two pages of history and marks fully_ingested', async () => {
    async function* twoPages() {
      // Page 1: recent txs (must have 100 items to trigger page 2 — we simulate with fewer but mock the loop)
      yield aliceTxsP1;
      yield p2Fixtures;
    }
    vi.mocked(enhancedClient.paginateTransactionHistory).mockReturnValue(twoPages());

    await ingestWalletHistory({
      db, enhancedBaseUrl: 'http://fake', apiKey: 'key',
      wallet: WALLET, mint: MINT, dexPrograms, limiter: mockLimiter,
    });

    const transfers = getTransfersForWallet(db, WALLET);
    // aliceTxsP1 has: buy_jupiter, sell_jupiter, plain_receive, plain_transfer, raydium_fallback = 5
    // p2Fixtures has: buy_old_1, receive_old_1 = 2
    expect(transfers.length).toBe(7);

    const cursor = getCursor(db, WALLET);
    expect(cursor!.fully_ingested).toBe(1);
  });

  it('cursor is updated after each page', async () => {
    let cursorsAfterPage1: CursorRow | undefined = undefined;

    async function* trackingPages() {
      yield aliceTxsP1;
      cursorsAfterPage1 = getCursor(db, WALLET);
      yield p2Fixtures;
    }
    vi.mocked(enhancedClient.paginateTransactionHistory).mockReturnValue(trackingPages());

    await ingestWalletHistory({
      db, enhancedBaseUrl: 'http://fake', apiKey: 'key',
      wallet: WALLET, mint: MINT, dexPrograms, limiter: mockLimiter,
    });

    // After page 1, cursor should be set to the oldest sig in page 1
    expect(cursorsAfterPage1).toBeDefined();
    expect(cursorsAfterPage1!.fully_ingested).toBe(0);
    expect(cursorsAfterPage1!.last_signature).toBeTruthy();
  });

  it('resumes from existing cursor on re-run', async () => {
    // Simulate a partially-ingested wallet: cursor exists with fully_ingested=0
    // (as if the process crashed mid-ingestion after page 1 was committed)
    const { upsertCursor } = await import('../../src/db/queries.js');
    upsertCursor(db, WALLET, 'sig_sell_jupiter', false); // last processed sig

    vi.mocked(enhancedClient.paginateTransactionHistory).mockReturnValue(
      (async function* () { yield p2Fixtures; })()
    );

    await ingestWalletHistory({
      db, enhancedBaseUrl: 'http://fake', apiKey: 'key',
      wallet: WALLET, mint: MINT, dexPrograms, limiter: mockLimiter,
    });

    // Should resume from the saved cursor signature
    expect(vi.mocked(enhancedClient.paginateTransactionHistory)).toHaveBeenCalledWith(
      'http://fake', 'key', WALLET, 'sig_sell_jupiter', mockLimiter,
    );

    const cursor = getCursor(db, WALLET);
    expect(cursor!.fully_ingested).toBe(1);
  });

  it('is idempotent — re-running does not duplicate transfers', async () => {
    vi.mocked(enhancedClient.paginateTransactionHistory).mockReturnValue(
      (async function* () { yield aliceTxsP1; })()
    );
    await ingestWalletHistory({
      db, enhancedBaseUrl: 'http://fake', apiKey: 'key',
      wallet: WALLET, mint: MINT, dexPrograms, limiter: mockLimiter,
    });

    const countBefore = getTransfersForWallet(db, WALLET).length;

    // Re-run with same data
    vi.mocked(enhancedClient.paginateTransactionHistory).mockReturnValue(
      (async function* () { yield aliceTxsP1; })()
    );
    await ingestWalletHistory({
      db, enhancedBaseUrl: 'http://fake', apiKey: 'key',
      wallet: WALLET, mint: MINT, dexPrograms, limiter: mockLimiter,
    });

    const countAfter = getTransfersForWallet(db, WALLET).length;
    expect(countAfter).toBe(countBefore);
  });

  it('skips wallet already marked fully_ingested', async () => {
    vi.mocked(enhancedClient.paginateTransactionHistory).mockReturnValue(
      (async function* () { yield aliceTxsP1; })()
    );
    await ingestWalletHistory({
      db, enhancedBaseUrl: 'http://fake', apiKey: 'key',
      wallet: WALLET, mint: MINT, dexPrograms, limiter: mockLimiter,
    });

    vi.clearAllMocks();

    await ingestWalletHistory({
      db, enhancedBaseUrl: 'http://fake', apiKey: 'key',
      wallet: WALLET, mint: MINT, dexPrograms, limiter: mockLimiter,
    });

    // Should not have called the API at all
    expect(enhancedClient.paginateTransactionHistory).not.toHaveBeenCalled();
  });

  it('stores raw_tx for each unique signature', async () => {
    vi.mocked(enhancedClient.paginateTransactionHistory).mockReturnValue(
      (async function* () { yield aliceTxsP1; })()
    );

    await ingestWalletHistory({
      db, enhancedBaseUrl: 'http://fake', apiKey: 'key',
      wallet: WALLET, mint: MINT, dexPrograms, limiter: mockLimiter,
    });

    // Verify raw_transactions were stored
    const raw = getRawTransaction(db, 'sig_buy_jupiter');
    expect(raw).toBeDefined();
    expect(raw!.slot).toBe(1000);

    const parsed = JSON.parse(raw!.raw_json);
    expect(parsed.signature).toBe('sig_buy_jupiter');
  });
});
