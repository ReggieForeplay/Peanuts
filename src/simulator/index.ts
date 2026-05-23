/**
 * Phase 4 Simulator — generates synthetic holder data for testing mechanics.
 *
 * Wallet archetypes:
 *   - "diamond_hand": buys once, never sells — longest streak
 *   - "paper_hand": buys then sells quickly, maybe rebuys
 *   - "aper": buys large amount right away
 *   - "mover": buys then wallet-to-wallets (does NOT break default streak)
 *   - "sybil": multiple wallets all buying small amounts
 */
import type Database from 'better-sqlite3';
import { upsertHolder, upsertRawTransaction, insertTransfer, upsertMintInfo } from '../db/queries.js';

const MINT = 'SIMULATED_MINT';
const BASE_TIME = 1700000000; // simulation start (unix seconds)
const DAY = 86400;

export interface SimulatorOptions {
  db: Database.Database;
  /** Total days to simulate (default: 30) */
  days?: number;
  seed?: number;
}

/** Seeded pseudo-random (good enough for simulation, not crypto). */
function makeRng(seed: number) {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) & 0xffffffff;
    return (s >>> 0) / 0xffffffff;
  };
}

export function runSimulator(opts: SimulatorOptions): void {
  const { db, days = 30, seed = 42 } = opts;
  const rng = makeRng(seed);
  const endTime = BASE_TIME + days * DAY;
  let sigCounter = 0;

  function sig() { return `sim_sig_${sigCounter++}`; }

  // Seed mint info
  upsertMintInfo(db, {
    mint_address: MINT,
    decimals: 6,
    symbol: 'PNUT',
    name: 'Peanuts (simulated)',
    total_supply: 1_000_000_000_000n,
    updated_at: BASE_TIME,
  });

  function addTransfer(
    wallet: string,
    direction: 'INBOUND' | 'OUTBOUND',
    amount: bigint,
    classification: 'BUY' | 'SELL' | 'PLAIN_RECEIVE' | 'PLAIN_TRANSFER',
    blockTime: number,
  ) {
    const signature = sig();
    upsertRawTransaction(db, {
      signature,
      slot: Math.floor((blockTime - BASE_TIME) / 0.4),
      block_time: blockTime,
      raw_json: JSON.stringify({ signature, source: direction === 'INBOUND' && classification === 'BUY' ? 'JUPITER' : 'UNKNOWN' }),
    });
    insertTransfer(db, {
      signature,
      slot: Math.floor((blockTime - BASE_TIME) / 0.4),
      block_time: blockTime,
      wallet,
      direction,
      amount,
      counterparty: direction === 'INBOUND' ? 'sim_dex' : 'sim_dex',
      classification,
    });
  }

  // ── Diamond hands (5 wallets) — buy once, hold entire period ──────────────
  for (let i = 0; i < 5; i++) {
    const wallet = `sim_diamond_${i}`;
    const buyTime = BASE_TIME + Math.floor(rng() * 3 * DAY); // buy in first 3 days
    const amount = BigInt(Math.floor(rng() * 900000 + 100000)); // 100k–1M tokens
    addTransfer(wallet, 'INBOUND', amount, 'BUY', buyTime);
    upsertHolder(db, { wallet, balance: amount, token_account: `ta_${wallet}`, snapshot_slot: 1, snapshot_time: endTime });
  }

  // ── Paper hands (8 wallets) — buy, sell quickly, maybe rebuy ─────────────
  for (let i = 0; i < 8; i++) {
    const wallet = `sim_paper_${i}`;
    const buyTime = BASE_TIME + Math.floor(rng() * 5 * DAY);
    const amount = BigInt(Math.floor(rng() * 500000 + 50000));
    addTransfer(wallet, 'INBOUND', amount, 'BUY', buyTime);

    const sellTime = buyTime + Math.floor(rng() * 3 * DAY) + 3600; // sell within 3 days
    addTransfer(wallet, 'OUTBOUND', amount, 'SELL', sellTime);

    // Some paper hands rebuy
    if (rng() > 0.4) {
      const rebuyTime = sellTime + Math.floor(rng() * 5 * DAY) + DAY;
      if (rebuyTime < endTime) {
        const rebuyAmount = BigInt(Math.floor(rng() * 300000 + 50000));
        addTransfer(wallet, 'INBOUND', rebuyAmount, 'BUY', rebuyTime);
        upsertHolder(db, { wallet, balance: rebuyAmount, token_account: `ta_${wallet}`, snapshot_slot: 1, snapshot_time: endTime });
      } else {
        upsertHolder(db, { wallet, balance: 0n, token_account: `ta_${wallet}`, snapshot_slot: 1, snapshot_time: endTime });
      }
    } else {
      upsertHolder(db, { wallet, balance: 0n, token_account: `ta_${wallet}`, snapshot_slot: 1, snapshot_time: endTime });
    }
  }

  // ── Movers (4 wallets) — buy, then wallet-to-wallet (streak survives) ─────
  for (let i = 0; i < 4; i++) {
    const wallet = `sim_mover_${i}`;
    const destWallet = `sim_mover_dest_${i}`;
    const buyTime = BASE_TIME + Math.floor(rng() * 5 * DAY);
    const amount = BigInt(Math.floor(rng() * 200000 + 50000));
    addTransfer(wallet, 'INBOUND', amount, 'BUY', buyTime);

    const moveTime = buyTime + Math.floor(rng() * 10 * DAY) + DAY;
    const moveAmount = BigInt(Math.floor(Number(amount) * 0.5));
    if (moveTime < endTime) {
      addTransfer(wallet, 'OUTBOUND', moveAmount, 'PLAIN_TRANSFER', moveTime);
      addTransfer(destWallet, 'INBOUND', moveAmount, 'PLAIN_RECEIVE', moveTime);
      upsertHolder(db, { wallet, balance: amount - moveAmount, token_account: `ta_${wallet}`, snapshot_slot: 1, snapshot_time: endTime });
      upsertHolder(db, { wallet: destWallet, balance: moveAmount, token_account: `ta_${destWallet}`, snapshot_slot: 1, snapshot_time: endTime });
    } else {
      upsertHolder(db, { wallet, balance: amount, token_account: `ta_${wallet}`, snapshot_slot: 1, snapshot_time: endTime });
    }
  }

  // ── Sybil cluster (10 small wallets) ─────────────────────────────────────
  for (let i = 0; i < 10; i++) {
    const wallet = `sim_sybil_${i}`;
    const buyTime = BASE_TIME + Math.floor(rng() * 2 * DAY);
    const amount = BigInt(Math.floor(rng() * 5000 + 1000)); // tiny amounts
    addTransfer(wallet, 'INBOUND', amount, 'BUY', buyTime);
    upsertHolder(db, { wallet, balance: amount, token_account: `ta_${wallet}`, snapshot_slot: 1, snapshot_time: endTime });
  }
}
