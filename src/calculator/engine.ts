import { createHash } from 'crypto';

export interface DistributionConfig {
  poolLamports: bigint;
  topN: number;
  curve: 'proportional' | 'linear';
  minStreakAgeSecs: number;
  minBalance: bigint;
  maxPayoutShare: number; // 0–1, e.g. 0.5 = 50% cap per wallet
  dustThreshold: bigint;
  computedAt: number; // unix seconds
}

export interface EligibleHolder {
  wallet: string;
  streakStart: number;
  streakDuration: number; // seconds
  currentBalance: bigint;
}

export interface DistributionEntry {
  wallet: string;
  rank: number;
  streakStart: number;
  streakDuration: number;
  weight: number;
  payoutLamports: bigint;
}

export interface DistributionPlan {
  config: DistributionConfig;
  entries: DistributionEntry[];
  totalPayout: bigint;
  dustLamports: bigint;
  planHash: string; // SHA256 of entries for tamper detection
}

/**
 * Pure function: given eligible holders and a config, produces a distribution plan.
 * Never sends anything. Output is fully reproducible from inputs.
 */
export function computeDistribution(
  holders: EligibleHolder[],
  config: DistributionConfig,
): DistributionPlan {
  const { poolLamports, topN, curve, minStreakAgeSecs, minBalance, maxPayoutShare } = config;

  // 1. Filter to eligible wallets
  const eligible = holders.filter(
    (h) =>
      h.streakDuration >= minStreakAgeSecs &&
      h.currentBalance >= minBalance,
  );

  // 2. Rank by streak_duration descending, take top N
  const ranked = eligible
    .sort((a, b) => b.streakDuration - a.streakDuration)
    .slice(0, topN);

  if (ranked.length === 0) {
    return {
      config,
      entries: [],
      totalPayout: 0n,
      dustLamports: poolLamports,
      planHash: hashEntries([]),
    };
  }

  // 3. Compute raw weights by curve
  const rawWeights = computeWeights(ranked, curve);

  // 4. Apply maxPayoutShare cap (iterate until stable)
  const finalWeights = applyPayoutCap(rawWeights, maxPayoutShare);

  // 5. Convert weights to lamports, floor each
  const pool = Number(poolLamports);
  const floored = finalWeights.map((w) => BigInt(Math.floor(w * pool)));
  const flooredTotal = floored.reduce((a, b) => a + b, 0n);
  const dust = poolLamports - flooredTotal;

  // 6. Give dust remainder to rank-1 wallet
  const payouts = [...floored];
  payouts[0] += dust;

  // 7. Build entries
  const entries: DistributionEntry[] = ranked.map((h, i) => ({
    wallet: h.wallet,
    rank: i + 1,
    streakStart: h.streakStart,
    streakDuration: h.streakDuration,
    weight: finalWeights[i],
    payoutLamports: payouts[i],
  }));

  const totalPayout = entries.reduce((s, e) => s + e.payoutLamports, 0n);

  // Invariant: total must equal pool exactly
  if (totalPayout !== poolLamports) {
    throw new Error(
      `Distribution invariant violated: total ${totalPayout} !== pool ${poolLamports}`,
    );
  }

  return {
    config,
    entries,
    totalPayout,
    dustLamports: dust,
    planHash: hashEntries(entries),
  };
}

/** Compute raw weights for ranked holders by the chosen curve. */
function computeWeights(
  ranked: EligibleHolder[],
  curve: DistributionConfig['curve'],
): number[] {
  if (curve === 'proportional') {
    const totalDuration = ranked.reduce((s, h) => s + h.streakDuration, 0);
    if (totalDuration === 0) return ranked.map(() => 1 / ranked.length);
    return ranked.map((h) => h.streakDuration / totalDuration);
  }

  // linear: rank 1 gets N points, rank 2 gets N-1, ..., rank N gets 1
  const N = ranked.length;
  const total = (N * (N + 1)) / 2;
  return ranked.map((_, i) => (N - i) / total);
}

/**
 * Iteratively cap any wallet's weight at maxPayoutShare and redistribute the excess.
 * Caps until stable (no wallet exceeds cap after redistribution).
 */
function applyPayoutCap(weights: number[], cap: number): number[] {
  let result = [...weights];
  for (let pass = 0; pass < 100; pass++) {
    const capped = result.map((w) => Math.min(w, cap));
    const excess = result.reduce((s, w, i) => s + Math.max(0, w - capped[i]), 0);
    if (excess < 1e-12) break; // stable

    // Redistribute excess proportionally to uncapped wallets
    const uncappedTotal = capped.reduce((s, w) => s + (w < cap ? w : 0), 0);
    result = capped.map((w) => (w < cap ? w + excess * (w / (uncappedTotal || 1)) : w));
  }

  // Renormalize to sum to 1.0 exactly (floating point cleanup)
  const sum = result.reduce((a, b) => a + b, 0);
  return result.map((w) => w / sum);
}

function hashEntries(entries: DistributionEntry[]): string {
  const canonical = JSON.stringify(
    entries.map((e) => ({
      wallet: e.wallet,
      rank: e.rank,
      payoutLamports: e.payoutLamports.toString(),
    })),
  );
  return createHash('sha256').update(canonical).digest('hex');
}
