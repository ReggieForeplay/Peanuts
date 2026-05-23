import type { TransferRow } from '../shared/types.js';

export interface StreakConfig {
  dustThreshold: bigint;
  strictMode: boolean;
  computedAt: number; // unix seconds
}

export interface StreakRecord {
  wallet: string;
  streak_start: number;
  streak_end: number | null;
  break_reason: 'SELL' | 'STRICT_OUTBOUND' | 'DUST_THRESHOLD' | null;
  status: 'ACTIVE' | 'BROKEN';
  peak_balance: bigint;
  computed_at: number;
}

/**
 * Pure function: given all transfers for a wallet (ordered by block_time ASC),
 * returns the full streak history — one StreakRecord per streak period.
 *
 * Rules (default mode):
 *   - Streak STARTS: first INBOUND that brings balance >= dustThreshold
 *   - Streak BREAKS: any SELL classification
 *   - PLAIN_TRANSFER outbound does NOT break the streak
 *
 * STRICT_MODE: any OUTBOUND breaks the streak.
 *
 * After a break, the next INBOUND that brings balance >= dustThreshold starts a fresh streak.
 * Streaks are never "inherited" — each new streak starts from scratch.
 */
export function computeStreaks(
  wallet: string,
  transfers: Pick<TransferRow, 'block_time' | 'direction' | 'amount' | 'classification'>[],
  config: StreakConfig,
): StreakRecord[] {
  const { dustThreshold, strictMode, computedAt } = config;
  const records: StreakRecord[] = [];

  let balance = 0n;
  let streakStart: number | null = null;
  let peakBalance = 0n;

  for (const tx of transfers) {
    if (tx.direction === 'INBOUND') {
      balance += tx.amount;
    } else {
      balance = balance > tx.amount ? balance - tx.amount : 0n;
    }

    // --- Break check (only when a streak is active) ---
    if (streakStart !== null) {
      const breakReason = getBreakReason(tx, strictMode);
      if (breakReason) {
        records.push({
          wallet,
          streak_start: streakStart,
          streak_end: tx.block_time,
          break_reason: breakReason,
          status: 'BROKEN',
          peak_balance: peakBalance,
          computed_at: computedAt,
        });
        streakStart = null;
        peakBalance = 0n;
        // Fall through: the same transfer may trigger a new streak (e.g. strict outbound
        // that's also an inbound — impossible, but kept symmetric with start check below)
      }
    }

    // --- Start check (only when no streak active) ---
    // Starts on the first INBOUND that brings balance to/above dustThreshold.
    // The streakStart===null guard means this never fires while a streak is active.
    if (streakStart === null && tx.direction === 'INBOUND' && balance >= dustThreshold) {
      streakStart = tx.block_time;
      peakBalance = balance;
    }

    // Track peak while streak is active
    if (streakStart !== null && balance > peakBalance) {
      peakBalance = balance;
    }
  }

  // Close out the final active streak
  if (streakStart !== null) {
    records.push({
      wallet,
      streak_start: streakStart,
      streak_end: null,
      break_reason: null,
      status: 'ACTIVE',
      peak_balance: peakBalance,
      computed_at: computedAt,
    });
  }

  return records;
}

function getBreakReason(
  tx: Pick<TransferRow, 'direction' | 'classification'>,
  strictMode: boolean,
): StreakRecord['break_reason'] {
  if (tx.direction !== 'OUTBOUND') return null;
  if (tx.classification === 'SELL') return 'SELL';
  if (strictMode) return 'STRICT_OUTBOUND';
  return null;
}

/** Duration in seconds for a streak record (uses computedAt for active streaks). */
export function streakDuration(record: StreakRecord): number {
  return (record.streak_end ?? record.computed_at) - record.streak_start;
}
