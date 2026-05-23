import express from 'express';
import type Database from 'better-sqlite3';
import {
  getActiveStreaks,
  getStreaksForWallet,
  getAllHolders,
  getMintInfo,
  getSnapshotLogs,
  getDistributionPlan,
} from '../db/queries.js';
import { streakDuration } from '../streak/engine.js';

export function createApp(db: Database.Database) {
  const app = express();
  app.use(express.json());

  // ── GET /api/stats ───────────────────────────────────────────────────────
  app.get('/api/stats', (_req, res) => {
    const holders = getAllHolders(db);
    const mintInfo = getMintInfo(db, process.env.TOKEN_MINT_ADDRESS ?? '');
    const snapshots = getSnapshotLogs(db);
    const activeStreaks = getActiveStreaks(db);
    res.json({
      holderCount: holders.length,
      activeStreakCount: activeStreaks.length,
      mintInfo: mintInfo
        ? { ...mintInfo, total_supply: mintInfo.total_supply.toString() }
        : null,
      lastSnapshot: snapshots[0] ?? null,
    });
  });

  // ── GET /api/leaderboard?limit=20 ────────────────────────────────────────
  app.get('/api/leaderboard', (req, res) => {
    const limit = Math.min(Number(req.query.limit) || 20, 100);
    const streaks = getActiveStreaks(db).slice(0, limit);
    res.json(
      streaks.map((s, i) => ({
        rank: i + 1,
        wallet: s.wallet,
        streakStart: s.streak_start,
        streakDuration: s.streak_duration,
        streakDays: (s.streak_duration / 86400).toFixed(1),
        peakBalance: s.peak_balance.toString(),
      })),
    );
  });

  // ── GET /api/wallet/:address ─────────────────────────────────────────────
  app.get('/api/wallet/:address', (req, res) => {
    const { address } = req.params;
    const history = getStreaksForWallet(db, address);
    const activeStreaks = getActiveStreaks(db);
    const rank = activeStreaks.findIndex((s) => s.wallet === address) + 1;

    const active = history.find((s) => s.status === 'ACTIVE');
    res.json({
      wallet: address,
      rank: rank > 0 ? rank : null,
      activeStreak: active
        ? {
            streakStart: active.streak_start,
            streakDuration: streakDuration(active),
            peakBalance: active.peak_balance.toString(),
          }
        : null,
      history: history.map((s) => ({
        ...s,
        peak_balance: s.peak_balance.toString(),
        streakDuration: streakDuration(s),
      })),
    });
  });

  // ── GET /api/plans ───────────────────────────────────────────────────────
  app.get('/api/plans', (_req, res) => {
    const rows = db.prepare(
      'SELECT id, created_at, pool_lamports, curve, recipient_count, total_payout, plan_hash, status FROM distribution_plans ORDER BY created_at DESC',
    ).all();
    res.json(rows);
  });

  // ── GET /api/plans/:id ───────────────────────────────────────────────────
  app.get('/api/plans/:id', (req, res) => {
    const planId = Number(req.params.id);
    const result = getDistributionPlan(db, planId);
    if (!result) {
      res.status(404).json({ error: 'Plan not found' });
      return;
    }
    res.json({
      ...result.plan,
      entries: result.entries.map((e) => ({
        ...e,
        payoutLamports: e.payoutLamports.toString(),
      })),
    });
  });

  // ── GET /api/payouts ─────────────────────────────────────────────────────
  app.get('/api/payouts', (_req, res) => {
    const rows = db
      .prepare(
        `SELECT p.id as plan_id, p.created_at, p.total_payout, p.status,
                e.wallet, e.rank, e.payout_lamports, e.streak_duration
         FROM distribution_plans p
         JOIN distribution_entries e ON e.plan_id = p.id
         WHERE p.status = 'EXECUTED'
         ORDER BY p.created_at DESC, e.rank ASC`,
      )
      .all();
    res.json(rows);
  });

  return app;
}

export async function startServer(db: Database.Database, port: number): Promise<void> {
  const app = createApp(db);
  return new Promise((resolve) => {
    app.listen(port, () => {
      console.log(`API server listening on http://localhost:${port}`);
      resolve();
    });
  });
}
