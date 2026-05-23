#!/usr/bin/env tsx
/**
 * $PEANUTS Phase 5 — Distribution Executor
 *
 * SAFETY GATES (all must pass before any SOL is sent):
 *   1. LIVE_MODE env var must be explicitly "true" (defaults to false)
 *   2. Dry-run prints the full payout list first
 *   3. Human confirmation prompt: type the exact total in SOL to confirm
 *   4. Idempotency: already-paid wallets are skipped (UNIQUE constraint in DB)
 *
 * Usage:
 *   tsx scripts/executor.ts --plan ./data/plan_123.json
 *   tsx scripts/executor.ts --plan ./data/plan_123.json --live  (sets LIVE_MODE=true)
 *
 * Requires in .env:
 *   DISTRIBUTION_WALLET_PRIVKEY=<base58 private key>  (NEVER commit this)
 */
import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import readline from 'readline';
import { Connection, Keypair, PublicKey, SystemProgram, Transaction, sendAndConfirmTransaction } from '@solana/web3.js';
import bs58 from 'bs58';
import { openDb } from '../src/db/client.js';
import { runMigrations } from '../src/db/schema.js';
import { logger } from '../src/shared/logger.js';

// ── LIVE_MODE gate ───────────────────────────────────────────────────────────
const LIVE_MODE =
  process.env.LIVE_MODE === 'true' || process.argv.includes('--live');

if (LIVE_MODE) {
  logger.warn('⚠️  LIVE_MODE is ON — real SOL will be sent');
} else {
  logger.info('🔒 DRY RUN mode (set LIVE_MODE=true or pass --live to execute)');
}

// ── Plan loading ─────────────────────────────────────────────────────────────
const planFlagIdx = process.argv.indexOf('--plan');
if (planFlagIdx === -1 || !process.argv[planFlagIdx + 1]) {
  logger.error('Usage: tsx scripts/executor.ts --plan <path-to-plan.json>');
  process.exit(1);
}
const planPath = path.resolve(process.argv[planFlagIdx + 1]);
if (!fs.existsSync(planPath)) {
  logger.error({ planPath }, 'Plan file not found');
  process.exit(1);
}

const plan = JSON.parse(fs.readFileSync(planPath, 'utf8'));
const entries = plan.entries as Array<{
  wallet: string;
  rank: number;
  streakDuration: number;
  payoutLamports: string;
}>;

if (!entries?.length) {
  logger.error('Plan has no entries — aborting');
  process.exit(1);
}

// ── Summary ──────────────────────────────────────────────────────────────────
const totalLamports = entries.reduce((s: bigint, e) => s + BigInt(e.payoutLamports), 0n);
const totalSol = Number(totalLamports) / 1e9;

console.log('\n═══════════════════════════════════════════════════════');
console.log('  $PEANUTS Distribution Plan — Payout Summary');
console.log('═══════════════════════════════════════════════════════');
console.log(`  Plan ID:     ${plan.planId ?? 'N/A'}`);
console.log(`  Hash:        ${plan.planHash}`);
console.log(`  Recipients:  ${entries.length}`);
console.log(`  Total:       ${totalSol.toFixed(9)} SOL (${totalLamports} lamports)`);
console.log('───────────────────────────────────────────────────────');
entries.forEach((e) => {
  const sol = (Number(BigInt(e.payoutLamports)) / 1e9).toFixed(6);
  const days = (e.streakDuration / 86400).toFixed(1);
  console.log(`  #${String(e.rank).padEnd(3)} ${e.wallet.slice(0, 8)}…${e.wallet.slice(-4)}  ${sol} SOL  (${days}d streak)`);
});
console.log('═══════════════════════════════════════════════════════\n');

if (!LIVE_MODE) {
  console.log('DRY RUN complete. Pass --live to execute.\n');
  process.exit(0);
}

// ── Live mode: load signer wallet ────────────────────────────────────────────
const privkeyEnv = process.env.DISTRIBUTION_WALLET_PRIVKEY;
if (!privkeyEnv) {
  logger.error('DISTRIBUTION_WALLET_PRIVKEY not set in .env — aborting');
  process.exit(1);
}
const signer = Keypair.fromSecretKey(bs58.decode(privkeyEnv));

const rpcUrl = process.env.HELIUS_RPC_URL ?? `https://mainnet.helius-rpc.com/?api-key=${process.env.HELIUS_API_KEY}`;
const connection = new Connection(rpcUrl, 'confirmed');

// ── Confirmation prompt ───────────────────────────────────────────────────────
const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
const confirm = (prompt: string) =>
  new Promise<string>((resolve) => rl.question(prompt, resolve));

const answer = await confirm(
  `Type the exact total in SOL to confirm (${totalSol.toFixed(9)}): `,
);
rl.close();

if (answer.trim() !== totalSol.toFixed(9)) {
  console.log('\nConfirmation mismatch — aborting. No funds sent.\n');
  process.exit(1);
}

// ── Open DB and execute ───────────────────────────────────────────────────────
const dbPath = process.env.DB_PATH ?? './data/peanuts.db';
const db = openDb(path.resolve(dbPath));
runMigrations(db);

const insertPayout = db.prepare(`
  INSERT OR IGNORE INTO executed_payouts
    (plan_id, wallet, rank, amount_lamports, status, executed_at)
  VALUES
    (@plan_id, @wallet, @rank, @amount_lamports, 'PENDING', @executed_at)
`);

const confirmPayout = db.prepare(`
  UPDATE executed_payouts
  SET tx_signature = @tx_signature, status = 'CONFIRMED', confirmed_at = @confirmed_at
  WHERE plan_id = @plan_id AND wallet = @wallet
`);

const failPayout = db.prepare(`
  UPDATE executed_payouts
  SET status = 'FAILED'
  WHERE plan_id = @plan_id AND wallet = @wallet
`);

let sent = 0;
let skipped = 0;
let failed = 0;

for (const entry of entries) {
  const alreadyPaid = db
    .prepare(`SELECT status FROM executed_payouts WHERE plan_id = ? AND wallet = ? AND status = 'CONFIRMED'`)
    .get(plan.planId, entry.wallet);

  if (alreadyPaid) {
    logger.info({ wallet: entry.wallet }, 'Already confirmed — skipping (idempotency)');
    skipped++;
    continue;
  }

  insertPayout.run({
    plan_id: plan.planId,
    wallet: entry.wallet,
    rank: entry.rank,
    amount_lamports: entry.payoutLamports,
    executed_at: Math.floor(Date.now() / 1000),
  });

  try {
    const tx = new Transaction().add(
      SystemProgram.transfer({
        fromPubkey: signer.publicKey,
        toPubkey: new PublicKey(entry.wallet),
        lamports: BigInt(entry.payoutLamports),
      }),
    );

    const signature = await sendAndConfirmTransaction(connection, tx, [signer]);
    confirmPayout.run({
      tx_signature: signature,
      confirmed_at: Math.floor(Date.now() / 1000),
      plan_id: plan.planId,
      wallet: entry.wallet,
    });
    logger.info({ wallet: entry.wallet, signature, rank: entry.rank }, 'Payout confirmed');
    sent++;
  } catch (err) {
    failPayout.run({ plan_id: plan.planId, wallet: entry.wallet });
    logger.error({ wallet: entry.wallet, err }, 'Payout FAILED');
    failed++;
  }
}

// Mark plan as executed
if (failed === 0) {
  db.prepare(`UPDATE distribution_plans SET status = 'EXECUTED' WHERE id = ?`).run(plan.planId);
}

db.close();
logger.info({ sent, skipped, failed }, 'Executor complete');
if (failed > 0) {
  logger.error('Some payouts failed — re-run executor to retry (idempotency prevents double-pay)');
  process.exit(1);
}
