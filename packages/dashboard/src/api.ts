const BASE = '/api';

export interface LeaderboardEntry {
  rank: number;
  wallet: string;
  streakStart: number;
  streakDuration: number;
  streakDays: string;
  peakBalance: string;
}

export interface WalletInfo {
  wallet: string;
  rank: number | null;
  activeStreak: {
    streakStart: number;
    streakDuration: number;
    peakBalance: string;
  } | null;
  history: Array<{
    streak_start: number;
    streak_end: number | null;
    status: string;
    break_reason: string | null;
    streakDuration: number;
    peak_balance: string;
  }>;
}

export interface Stats {
  holderCount: number;
  activeStreakCount: number;
  mintInfo: { symbol: string; decimals: number } | null;
  lastSnapshot: { taken_at: number; holder_count: number } | null;
}

async function get<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE}${path}`);
  if (!res.ok) throw new Error(`API error ${res.status}`);
  return res.json() as Promise<T>;
}

export const api = {
  stats: () => get<Stats>('/stats'),
  leaderboard: (limit = 20) => get<LeaderboardEntry[]>(`/leaderboard?limit=${limit}`),
  wallet: (address: string) => get<WalletInfo>(`/wallet/${address}`),
  payouts: () => get<unknown[]>('/payouts'),
};
