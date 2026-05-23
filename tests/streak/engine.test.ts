import { describe, it, expect } from 'vitest';
import { computeStreaks, streakDuration } from '../../src/streak/engine.js';
import type { StreakConfig } from '../../src/streak/engine.js';

const WALLET = 'wallet_test';
const COMPUTED_AT = 1700100000; // reference "now"

const cfg: StreakConfig = {
  dustThreshold: 1000n,
  strictMode: false,
  computedAt: COMPUTED_AT,
};

const strictCfg: StreakConfig = { ...cfg, strictMode: true };

// Helper: build a minimal transfer-like object
function tx(
  block_time: number,
  direction: 'INBOUND' | 'OUTBOUND',
  amount: bigint,
  classification: 'BUY' | 'SELL' | 'PLAIN_RECEIVE' | 'PLAIN_TRANSFER' | null = null,
) {
  return { block_time, direction, amount, classification };
}

describe('computeStreaks — basic lifecycle', () => {
  it('empty transfers → no streaks', () => {
    expect(computeStreaks(WALLET, [], cfg)).toHaveLength(0);
  });

  it('single BUY above threshold → one ACTIVE streak', () => {
    const records = computeStreaks(WALLET, [tx(1000, 'INBOUND', 5000n, 'BUY')], cfg);
    expect(records).toHaveLength(1);
    expect(records[0].status).toBe('ACTIVE');
    expect(records[0].streak_start).toBe(1000);
    expect(records[0].streak_end).toBeNull();
  });

  it('BUY below threshold → no streak yet', () => {
    const records = computeStreaks(WALLET, [tx(1000, 'INBOUND', 500n, 'BUY')], cfg);
    expect(records).toHaveLength(0);
  });

  it('BUY below threshold then above → streak starts at second BUY', () => {
    const records = computeStreaks(WALLET, [
      tx(1000, 'INBOUND', 500n, 'BUY'),
      tx(2000, 'INBOUND', 700n, 'BUY'), // total 1200 > 1000 → crosses threshold
    ], cfg);
    expect(records).toHaveLength(1);
    expect(records[0].streak_start).toBe(2000); // crossed on second inbound
    expect(records[0].status).toBe('ACTIVE');
  });

  it('SELL breaks active streak', () => {
    const records = computeStreaks(WALLET, [
      tx(1000, 'INBOUND', 5000n, 'BUY'),
      tx(2000, 'OUTBOUND', 2000n, 'SELL'),
    ], cfg);
    expect(records).toHaveLength(1);
    expect(records[0].status).toBe('BROKEN');
    expect(records[0].streak_end).toBe(2000);
    expect(records[0].break_reason).toBe('SELL');
  });
});

describe('computeStreaks — partial sells', () => {
  it('partial sell (retains balance above dust) still breaks streak', () => {
    const records = computeStreaks(WALLET, [
      tx(1000, 'INBOUND', 5000n, 'BUY'),
      tx(2000, 'OUTBOUND', 1000n, 'SELL'), // sells 1000, retains 4000 — still breaks
    ], cfg);
    expect(records).toHaveLength(1);
    expect(records[0].status).toBe('BROKEN');
    expect(records[0].break_reason).toBe('SELL');
  });
});

describe('computeStreaks — sell-then-rebuy', () => {
  it('sell breaks streak, new BUY starts a fresh streak', () => {
    const records = computeStreaks(WALLET, [
      tx(1000, 'INBOUND', 5000n, 'BUY'),
      tx(2000, 'OUTBOUND', 5000n, 'SELL'),       // full exit, streak broken
      tx(3000, 'INBOUND', 2000n, 'BUY'),         // rebuy above threshold → new streak
    ], cfg);
    expect(records).toHaveLength(2);
    expect(records[0].status).toBe('BROKEN');
    expect(records[0].streak_start).toBe(1000);
    expect(records[1].status).toBe('ACTIVE');
    expect(records[1].streak_start).toBe(3000);  // fresh start
  });

  it('rebuy after partial sell starts new streak from next inbound', () => {
    const records = computeStreaks(WALLET, [
      tx(1000, 'INBOUND', 5000n, 'BUY'),
      tx(2000, 'OUTBOUND', 3000n, 'SELL'),  // partial sell, balance=2000, streak broken
      tx(3000, 'INBOUND', 1000n, 'BUY'),    // balance=3000 >= threshold → new streak
    ], cfg);
    expect(records).toHaveLength(2);
    expect(records[1].streak_start).toBe(3000);
  });
});

describe('computeStreaks — plain transfers', () => {
  it('PLAIN_TRANSFER outbound does NOT break streak in default mode', () => {
    const records = computeStreaks(WALLET, [
      tx(1000, 'INBOUND', 5000n, 'BUY'),
      tx(2000, 'OUTBOUND', 2000n, 'PLAIN_TRANSFER'), // wallet-to-wallet, safe
    ], cfg);
    expect(records).toHaveLength(1);
    expect(records[0].status).toBe('ACTIVE'); // still alive
  });

  it('PLAIN_RECEIVE starts a new streak (not inherited from sender)', () => {
    const records = computeStreaks(WALLET, [
      tx(1000, 'INBOUND', 3000n, 'PLAIN_RECEIVE'), // received via transfer
    ], cfg);
    expect(records).toHaveLength(1);
    expect(records[0].streak_start).toBe(1000);
    expect(records[0].status).toBe('ACTIVE');
  });
});

describe('computeStreaks — STRICT_MODE', () => {
  it('PLAIN_TRANSFER breaks streak in STRICT_MODE', () => {
    const records = computeStreaks(WALLET, [
      tx(1000, 'INBOUND', 5000n, 'BUY'),
      tx(2000, 'OUTBOUND', 1000n, 'PLAIN_TRANSFER'),
    ], strictCfg);
    expect(records).toHaveLength(1);
    expect(records[0].status).toBe('BROKEN');
    expect(records[0].break_reason).toBe('STRICT_OUTBOUND');
  });

  it('SELL still breaks streak in STRICT_MODE (SELL takes precedence)', () => {
    const records = computeStreaks(WALLET, [
      tx(1000, 'INBOUND', 5000n, 'BUY'),
      tx(2000, 'OUTBOUND', 1000n, 'SELL'),
    ], strictCfg);
    expect(records[0].break_reason).toBe('SELL');
  });
});

describe('computeStreaks — peak balance tracking', () => {
  it('records the peak balance during the streak', () => {
    const records = computeStreaks(WALLET, [
      tx(1000, 'INBOUND', 5000n, 'BUY'),
      tx(2000, 'INBOUND', 3000n, 'BUY'),  // balance peaks at 8000
      tx(3000, 'OUTBOUND', 1000n, 'PLAIN_TRANSFER'),
    ], cfg);
    expect(records[0].peak_balance).toBe(8000n);
  });
});

describe('computeStreaks — multiple streak cycles', () => {
  it('three complete cycles with increasing streak starts', () => {
    const records = computeStreaks(WALLET, [
      tx(1000, 'INBOUND', 5000n, 'BUY'),
      tx(2000, 'OUTBOUND', 5000n, 'SELL'),
      tx(3000, 'INBOUND', 2000n, 'BUY'),
      tx(4000, 'OUTBOUND', 2000n, 'SELL'),
      tx(5000, 'INBOUND', 3000n, 'BUY'),
    ], cfg);
    expect(records).toHaveLength(3);
    expect(records[0].streak_start).toBe(1000);
    expect(records[0].status).toBe('BROKEN');
    expect(records[1].streak_start).toBe(3000);
    expect(records[1].status).toBe('BROKEN');
    expect(records[2].streak_start).toBe(5000);
    expect(records[2].status).toBe('ACTIVE');
  });
});

describe('streakDuration', () => {
  it('returns computed_at - streak_start for active streaks', () => {
    const record = {
      wallet: WALLET, streak_start: 1700000000, streak_end: null,
      break_reason: null, status: 'ACTIVE' as const,
      peak_balance: 5000n, computed_at: 1700100000,
    };
    expect(streakDuration(record)).toBe(100000);
  });

  it('returns streak_end - streak_start for broken streaks', () => {
    const record = {
      wallet: WALLET, streak_start: 1700000000, streak_end: 1700050000,
      break_reason: 'SELL' as const, status: 'BROKEN' as const,
      peak_balance: 5000n, computed_at: 1700100000,
    };
    expect(streakDuration(record)).toBe(50000);
  });
});
