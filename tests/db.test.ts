import { describe, it, expect, beforeEach } from 'vitest';
import { openMemoryDb } from '../src/db/client.js';
import { runMigrations } from '../src/db/schema.js';
import {
  upsertMintInfo,
  getMintInfo,
  upsertHolder,
  getAllHolders,
  upsertRawTransaction,
  insertTransfer,
  getTransfersForWallet,
  upsertCursor,
  getCursor,
  insertSnapshotLog,
  getSnapshotLogs,
} from '../src/db/queries.js';
import type Database from 'better-sqlite3';

let db: Database.Database;

beforeEach(() => {
  db = openMemoryDb();
  runMigrations(db);
});

describe('mint_info', () => {
  it('upserts and retrieves mint info', () => {
    upsertMintInfo(db, {
      mint_address: 'mint1',
      decimals: 6,
      symbol: 'PNUT',
      name: 'Peanuts',
      total_supply: 1_000_000_000n,
      updated_at: 1700000000,
    });
    const row = getMintInfo(db, 'mint1');
    expect(row).toBeDefined();
    expect(row!.total_supply).toBe(1_000_000_000n);
    expect(row!.symbol).toBe('PNUT');
  });

  it('updates on conflict', () => {
    upsertMintInfo(db, { mint_address: 'mint1', decimals: 6, symbol: 'A', name: null, total_supply: 1n, updated_at: 1 });
    upsertMintInfo(db, { mint_address: 'mint1', decimals: 9, symbol: 'B', name: 'New', total_supply: 2n, updated_at: 2 });
    const row = getMintInfo(db, 'mint1');
    expect(row!.decimals).toBe(9);
    expect(row!.symbol).toBe('B');
  });
});

describe('holders', () => {
  it('upserts holders and retrieves them', () => {
    upsertHolder(db, { wallet: 'w1', balance: 500n, token_account: 'ta1', snapshot_slot: 100, snapshot_time: 1700000000 });
    upsertHolder(db, { wallet: 'w2', balance: 1000n, token_account: 'ta2', snapshot_slot: 100, snapshot_time: 1700000000 });
    const holders = getAllHolders(db);
    expect(holders).toHaveLength(2);
    expect(holders.find((h) => h.wallet === 'w1')!.balance).toBe(500n);
  });

  it('updates balance on re-snapshot', () => {
    upsertHolder(db, { wallet: 'w1', balance: 500n, token_account: 'ta1', snapshot_slot: 100, snapshot_time: 1700000000 });
    upsertHolder(db, { wallet: 'w1', balance: 750n, token_account: 'ta1', snapshot_slot: 200, snapshot_time: 1700001000 });
    const holders = getAllHolders(db);
    expect(holders).toHaveLength(1);
    expect(holders[0].balance).toBe(750n);
  });
});

describe('raw_transactions + transfers', () => {
  it('inserts raw tx and transfer, retrieves by wallet', () => {
    upsertRawTransaction(db, { signature: 'sig1', slot: 1000, block_time: 1700000000, raw_json: '{}' });
    insertTransfer(db, {
      signature: 'sig1', slot: 1000, block_time: 1700000000,
      wallet: 'w1', direction: 'OUTBOUND', amount: 100n,
      counterparty: 'dex1', classification: 'SELL',
    });
    const transfers = getTransfersForWallet(db, 'w1');
    expect(transfers).toHaveLength(1);
    expect(transfers[0].amount).toBe(100n);
    expect(transfers[0].classification).toBe('SELL');
  });

  it('INSERT OR IGNORE prevents duplicate transfers', () => {
    upsertRawTransaction(db, { signature: 'sig1', slot: 1000, block_time: 1700000000, raw_json: '{}' });
    insertTransfer(db, { signature: 'sig1', slot: 1000, block_time: 1700000000, wallet: 'w1', direction: 'OUTBOUND', amount: 100n, counterparty: null, classification: 'SELL' });
    insertTransfer(db, { signature: 'sig1', slot: 1000, block_time: 1700000000, wallet: 'w1', direction: 'OUTBOUND', amount: 100n, counterparty: null, classification: 'SELL' });
    expect(getTransfersForWallet(db, 'w1')).toHaveLength(1);
  });

  it('returns transfers ordered by block_time asc', () => {
    upsertRawTransaction(db, { signature: 's1', slot: 1, block_time: 1000, raw_json: '{}' });
    upsertRawTransaction(db, { signature: 's2', slot: 2, block_time: 2000, raw_json: '{}' });
    insertTransfer(db, { signature: 's2', slot: 2, block_time: 2000, wallet: 'w1', direction: 'INBOUND', amount: 200n, counterparty: null, classification: 'BUY' });
    insertTransfer(db, { signature: 's1', slot: 1, block_time: 1000, wallet: 'w1', direction: 'INBOUND', amount: 100n, counterparty: null, classification: 'BUY' });
    const transfers = getTransfersForWallet(db, 'w1');
    expect(transfers[0].block_time).toBe(1000);
    expect(transfers[1].block_time).toBe(2000);
  });
});

describe('ingestion_cursors', () => {
  it('upserts and retrieves cursor', () => {
    upsertCursor(db, 'w1', 'sig_abc', false);
    const c = getCursor(db, 'w1');
    expect(c!.last_signature).toBe('sig_abc');
    expect(c!.fully_ingested).toBe(0);
  });

  it('marks fully ingested', () => {
    upsertCursor(db, 'w1', 'sig_abc', false);
    upsertCursor(db, 'w1', 'sig_xyz', true);
    const c = getCursor(db, 'w1');
    expect(c!.fully_ingested).toBe(1);
    expect(c!.last_signature).toBe('sig_xyz');
  });
});

describe('snapshot_log', () => {
  it('inserts snapshot log entries', () => {
    insertSnapshotLog(db, { taken_at: 1700000000, mint_address: 'mint1', holder_count: 42, total_supply: 1000n });
    insertSnapshotLog(db, { taken_at: 1700001000, mint_address: 'mint1', holder_count: 45, total_supply: 1000n });
    const logs = getSnapshotLogs(db);
    expect(logs).toHaveLength(2);
    expect(logs[0].holder_count).toBe(45); // newest first
  });
});
