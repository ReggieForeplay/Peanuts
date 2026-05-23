import { describe, it, expect, vi, beforeEach } from 'vitest';
import { openMemoryDb } from '../../src/db/client.js';
import { runMigrations } from '../../src/db/schema.js';
import { runSnapshot } from '../../src/ingester/snapshot.js';
import { getAllHolders, getMintInfo, getSnapshotLogs } from '../../src/db/queries.js';
import type { RateLimiter } from '../../src/shared/rate-limiter.js';
import type Database from 'better-sqlite3';

const MINT = 'PEANUTS_MINT';
const DAS_URL = 'http://fake-das';

// Instant no-op rate limiter for tests
const mockLimiter: RateLimiter = {
  schedule: (fn) => fn(),
};

let db: Database.Database;

beforeEach(() => {
  db = openMemoryDb();
  runMigrations(db);
  vi.clearAllMocks();
});

// We mock the DAS client module to avoid real network calls
vi.mock('../../src/ingester/das-client.js', () => ({
  paginateTokenAccounts: vi.fn(),
  getMintMetadata: vi.fn(),
}));

import * as dasClient from '../../src/ingester/das-client.js';

describe('runSnapshot', () => {
  it('upserts all holders from a multi-page response', async () => {
    vi.mocked(dasClient.getMintMetadata).mockResolvedValue({
      decimals: 6,
      symbol: 'PNUT',
      name: 'Peanuts',
      supply: '9000000000',
    });

    // Simulate 2-page pagination: page1 has 3 accounts, page2 has 1
    async function* fakePages() {
      yield [
        { address: 'ta_alice', owner: 'wallet_alice', mint: MINT, amount: '5000', frozen: false },
        { address: 'ta_bob', owner: 'wallet_bob', mint: MINT, amount: '3000', frozen: false },
        { address: 'ta_charlie', owner: 'wallet_charlie', mint: MINT, amount: '1000', frozen: true },
      ];
      yield [
        { address: 'ta_dave', owner: 'wallet_dave', mint: MINT, amount: '250', frozen: false },
      ];
    }
    vi.mocked(dasClient.paginateTokenAccounts).mockReturnValue(fakePages() as ReturnType<typeof dasClient.paginateTokenAccounts>);

    const result = await runSnapshot(db, DAS_URL, MINT, mockLimiter);

    expect(result.holderCount).toBe(4);
    const holders = getAllHolders(db);
    expect(holders).toHaveLength(4);
    expect(holders.find((h) => h.wallet === 'wallet_alice')!.balance).toBe(5000n);
    expect(holders.find((h) => h.wallet === 'wallet_charlie')!.balance).toBe(1000n); // frozen preserved
  });

  it('filters out zero-balance accounts', async () => {
    vi.mocked(dasClient.getMintMetadata).mockResolvedValue({ decimals: 6, supply: '1000' });

    async function* fakePages() {
      yield [
        { address: 'ta_alice', owner: 'wallet_alice', mint: MINT, amount: '500', frozen: false },
        { address: 'ta_zero', owner: 'wallet_zero', mint: MINT, amount: '0', frozen: false },
      ];
    }
    vi.mocked(dasClient.paginateTokenAccounts).mockReturnValue(fakePages() as ReturnType<typeof dasClient.paginateTokenAccounts>);

    const result = await runSnapshot(db, DAS_URL, MINT, mockLimiter);

    expect(result.holderCount).toBe(1);
    const holders = getAllHolders(db);
    expect(holders).toHaveLength(1);
    expect(holders[0].wallet).toBe('wallet_alice');
  });

  it('upserts mint_info correctly', async () => {
    vi.mocked(dasClient.getMintMetadata).mockResolvedValue({
      decimals: 9,
      symbol: 'PNUT',
      name: 'Peanuts Token',
      supply: '1000000000000000000',
    });
    async function* fakePages() { yield []; }
    vi.mocked(dasClient.paginateTokenAccounts).mockReturnValue(fakePages() as ReturnType<typeof dasClient.paginateTokenAccounts>);

    await runSnapshot(db, DAS_URL, MINT, mockLimiter);

    const mintInfo = getMintInfo(db, MINT);
    expect(mintInfo).toBeDefined();
    expect(mintInfo!.decimals).toBe(9);
    expect(mintInfo!.symbol).toBe('PNUT');
    expect(mintInfo!.total_supply).toBe(1000000000000000000n);
  });

  it('inserts a snapshot_log entry on each run', async () => {
    vi.mocked(dasClient.getMintMetadata).mockResolvedValue({ decimals: 6, supply: '1000' });
    async function* fakePages() { yield []; }
    vi.mocked(dasClient.paginateTokenAccounts).mockReturnValue(fakePages() as ReturnType<typeof dasClient.paginateTokenAccounts>);

    await runSnapshot(db, DAS_URL, MINT, mockLimiter);
    await runSnapshot(db, DAS_URL, MINT, mockLimiter);

    const logs = getSnapshotLogs(db);
    expect(logs).toHaveLength(2);
  });

  it('updates holder balances on re-snapshot without creating duplicates', async () => {
    vi.mocked(dasClient.getMintMetadata).mockResolvedValue({ decimals: 6, supply: '10000' });

    async function* firstSnapshot() {
      yield [{ address: 'ta_alice', owner: 'wallet_alice', mint: MINT, amount: '5000', frozen: false }];
    }
    async function* secondSnapshot() {
      yield [{ address: 'ta_alice', owner: 'wallet_alice', mint: MINT, amount: '7500', frozen: false }];
    }

    vi.mocked(dasClient.paginateTokenAccounts).mockReturnValueOnce(firstSnapshot() as ReturnType<typeof dasClient.paginateTokenAccounts>);
    vi.mocked(dasClient.paginateTokenAccounts).mockReturnValueOnce(secondSnapshot() as ReturnType<typeof dasClient.paginateTokenAccounts>);

    await runSnapshot(db, DAS_URL, MINT, mockLimiter);
    await runSnapshot(db, DAS_URL, MINT, mockLimiter);

    const holders = getAllHolders(db);
    expect(holders).toHaveLength(1);
    expect(holders[0].balance).toBe(7500n);
  });
});
