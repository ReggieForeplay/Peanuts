import { describe, it, expect } from 'vitest';
import { computeDistribution } from '../../src/calculator/engine.js';
import type { DistributionConfig, EligibleHolder } from '../../src/calculator/engine.js';

const NOW = 1700100000;
const ONE_SOL = 1_000_000_000n; // 1 SOL in lamports

const baseCfg: DistributionConfig = {
  poolLamports: ONE_SOL,
  topN: 5,
  curve: 'proportional',
  minStreakAgeSecs: 0,
  minBalance: 0n,
  maxPayoutShare: 1.0, // no cap
  dustThreshold: 1000n,
  computedAt: NOW,
};

function holder(wallet: string, streakDuration: number, balance = 10000n): EligibleHolder {
  return { wallet, streakStart: NOW - streakDuration, streakDuration, currentBalance: balance };
}

describe('computeDistribution — basic', () => {
  it('returns empty plan when no holders', () => {
    const plan = computeDistribution([], baseCfg);
    expect(plan.entries).toHaveLength(0);
    expect(plan.totalPayout).toBe(0n);
    expect(plan.dustLamports).toBe(ONE_SOL);
  });

  it('gives all funds to single holder', () => {
    const plan = computeDistribution([holder('w1', 86400)], baseCfg);
    expect(plan.entries).toHaveLength(1);
    expect(plan.entries[0].payoutLamports).toBe(ONE_SOL);
    expect(plan.totalPayout).toBe(ONE_SOL);
  });

  it('total payout always equals pool exactly (no lamports lost)', () => {
    const holders = [
      holder('w1', 100000),
      holder('w2', 75000),
      holder('w3', 50000),
      holder('w4', 25000),
      holder('w5', 10000),
    ];
    const plan = computeDistribution(holders, baseCfg);
    expect(plan.totalPayout).toBe(ONE_SOL);
  });

  it('ranks by streak_duration descending', () => {
    const holders = [holder('w1', 50000), holder('w2', 100000), holder('w3', 75000)];
    const plan = computeDistribution(holders, baseCfg);
    expect(plan.entries[0].wallet).toBe('w2'); // longest
    expect(plan.entries[1].wallet).toBe('w3');
    expect(plan.entries[2].wallet).toBe('w1'); // shortest
  });

  it('top N cap: only selects top 3 when topN=3', () => {
    const holders = [holder('w1',100), holder('w2',200), holder('w3',300), holder('w4',400)];
    const plan = computeDistribution(holders, { ...baseCfg, topN: 3 });
    expect(plan.entries).toHaveLength(3);
    expect(plan.entries.map((e) => e.wallet)).toContain('w4');
    expect(plan.entries.map((e) => e.wallet)).not.toContain('w1'); // shortest excluded
  });
});

describe('computeDistribution — proportional curve', () => {
  it('proportional: w1 holds 3x longer than w2 → gets 3x payout', () => {
    const holders = [holder('w1', 30000), holder('w2', 10000)];
    const plan = computeDistribution(holders, baseCfg);
    const w1 = plan.entries.find((e) => e.wallet === 'w1')!;
    const w2 = plan.entries.find((e) => e.wallet === 'w2')!;
    // w1 should get ~3x w2 (before dust adjustment)
    const ratio = Number(w1.payoutLamports) / Number(w2.payoutLamports);
    expect(ratio).toBeCloseTo(3, 0);
  });
});

describe('computeDistribution — linear curve', () => {
  it('linear: rank weights are N, N-1, ..., 1', () => {
    const holders = [holder('w1', 100), holder('w2', 200), holder('w3', 300)];
    const plan = computeDistribution(holders, { ...baseCfg, curve: 'linear' });
    // top N=3: weights = 3/6, 2/6, 1/6
    expect(plan.entries[0].weight).toBeCloseTo(3 / 6, 5);
    expect(plan.entries[1].weight).toBeCloseTo(2 / 6, 5);
    expect(plan.entries[2].weight).toBeCloseTo(1 / 6, 5);
    expect(plan.totalPayout).toBe(ONE_SOL);
  });
});

describe('computeDistribution — anti-sybil filters', () => {
  it('minStreakAgeSecs filters out short streaks', () => {
    const holders = [
      holder('w1', 86400 * 7),  // 7 days — eligible
      holder('w2', 3600),        // 1 hour — filtered
    ];
    const plan = computeDistribution(holders, { ...baseCfg, minStreakAgeSecs: 86400 });
    expect(plan.entries).toHaveLength(1);
    expect(plan.entries[0].wallet).toBe('w1');
    expect(plan.totalPayout).toBe(ONE_SOL);
  });

  it('minBalance filters out holders below threshold', () => {
    const holders = [
      holder('w1', 10000, 5000n),  // eligible
      holder('w2', 20000, 500n),   // filtered (below minBalance)
    ];
    const plan = computeDistribution(holders, { ...baseCfg, minBalance: 1000n });
    expect(plan.entries).toHaveLength(1);
    expect(plan.entries[0].wallet).toBe('w1');
  });

  it('maxPayoutShare caps any single wallet', () => {
    // One wallet holds 10x longer — would get >80% with proportional
    const holders = [holder('w1', 100000), holder('w2', 10000)];
    const plan = computeDistribution(holders, { ...baseCfg, maxPayoutShare: 0.5 });
    const w1 = plan.entries.find((e) => e.wallet === 'w1')!;
    const w1Share = Number(w1.payoutLamports) / Number(ONE_SOL);
    expect(w1Share).toBeLessThanOrEqual(0.5001); // allow tiny fp error
    expect(plan.totalPayout).toBe(ONE_SOL);
  });
});

describe('computeDistribution — plan hash', () => {
  it('same inputs produce same hash', () => {
    const holders = [holder('w1', 10000), holder('w2', 20000)];
    const p1 = computeDistribution(holders, baseCfg);
    const p2 = computeDistribution(holders, baseCfg);
    expect(p1.planHash).toBe(p2.planHash);
  });

  it('different payouts produce different hash', () => {
    const h1 = [holder('w1', 10000), holder('w2', 10000)]; // equal split
    const h2 = [holder('w1', 90000), holder('w2', 10000)]; // w1 gets 9x more
    const p1 = computeDistribution(h1, baseCfg);
    const p2 = computeDistribution(h2, baseCfg);
    expect(p1.planHash).not.toBe(p2.planHash);
  });
});
