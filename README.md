# $PEANUTS — Longest-Holder Reward Distribution System

An off-chain service that tracks $PEANUTS (Solana memecoin) hold-streaks and
distributes claimed creator fees to the longest-surviving holders — not the biggest bags.

> **"Not selling for peanuts"** — loyalty over size.

---

## Architecture

```
Phase 1  Holder snapshot + transfer-history ingestion (READ ONLY)
Phase 2  Streak engine — computes hold-streaks from ingested data
Phase 3  Distribution calculator — produces signed-off JSON payout plans
Phase 4  Simulator + React/Vite holder dashboard
Phase 5  Live executor — gated behind LIVE_MODE=true
```

All phases use SQLite as the source of truth. No private keys until Phase 5.
Nothing signs or sends transactions in Phases 1–4.

---

## Quick Start

```bash
# 1. Install dependencies
npm install

# 2. Configure environment
cp .env.example .env
# Edit .env — set HELIUS_API_KEY and TOKEN_MINT_ADDRESS

# 3. Phase 1 — ingest holder data
npm run ingest

# 4. Phase 2 — compute streaks
npm run streaks

# 5. Phase 3 — generate a payout plan
POOL_SOL=1.0 npm run calculate
# Review data/plans/plan_<timestamp>.json before proceeding

# 6. Phase 4 — start the API + dashboard
npm run api           # terminal 1: http://localhost:3001
cd packages/dashboard && npm run dev  # terminal 2: http://localhost:5173

# Simulate the full pipeline with synthetic data (no real API key needed)
npm run simulate
```

---

## Phase 5 — Live Executor (GATED)

Only run after you've reviewed and approved a distribution plan:

```bash
# Dry run (safe — prints what would be sent, sends nothing)
npm run execute -- --plan ./data/plans/plan_123.json

# Live execution (requires DISTRIBUTION_WALLET_PRIVKEY in .env)
LIVE_MODE=true npm run execute -- --plan ./data/plans/plan_123.json --live
```

**Safety gates:** dry-run always runs first · human confirmation prompt showing exact SOL total · idempotency prevents double-pay on retry.

---

## NPM Scripts Reference

| Script | Description |
|--------|-------------|
| `npm run ingest` | Phase 1: snapshot holders + fetch transfer history |
| `npm run ingest -- --force` | Re-ingest all wallets including completed ones |
| `npm run streaks` | Phase 2: compute streak history for all wallets |
| `npm run streaks -- --strict` | Strict mode: any outbound breaks streak |
| `npm run calculate` | Phase 3: generate a distribution plan JSON |
| `npm run simulate` | Phases 1–3 on synthetic data (no API key needed) |
| `npm run api` | Phase 4: start the Express API server |
| `npm run execute` | Phase 5: dry-run the executor |
| `npm test` | Run all 62 tests |
| `npm run build` | TypeScript typecheck |

---

## Environment Variables

See `.env.example` for all options. Required:
- `HELIUS_API_KEY` — from https://dev.helius.xyz
- `TOKEN_MINT_ADDRESS` — your $PEANUTS SPL token mint

Phase 5 only:
- `DISTRIBUTION_WALLET_PRIVKEY` — base58 private key (NEVER commit)
- `LIVE_MODE=true` — explicitly required to send real transactions

---

## Database Schema

SQLite at `data/peanuts.db` (gitignored). Key tables:

| Table | Description |
|-------|-------------|
| `holders` | Current token holders + balances (upserted each run) |
| `transfers` | Append-only wallet-centric transfer event log |
| `raw_transactions` | Full Helius enhanced TX JSON per signature (audit trail) |
| `ingestion_cursors` | Pagination state per wallet (resumable ingestion) |
| `streaks` | Full streak history per wallet (all past + active streaks) |
| `distribution_plans` | Payout plans with SHA256 hash for tamper detection |
| `distribution_entries` | Per-wallet entries for each plan |
| `executed_payouts` | Confirmed payout records with Solana tx signatures |
| `snapshot_log` | Immutable log of every ingestion snapshot |

---

## DEX Classification

Outbound transfers are classified as `SELL` if the transaction involved a known DEX.
Primary signal: Helius `tx.source` field. Fallback: instruction program ID matching.
Extend `config/dex-programs.json` to add new DEXes without code changes.

---

## Streak Rules

- **Streak STARTS:** First token acquisition bringing balance above dust threshold
- **Streak BREAKS (default):** Any classified `SELL` on a DEX
- **Streak BREAKS (strict mode):** Any outbound transfer at all
- **Safe:** Wallet-to-wallet transfers (`PLAIN_TRANSFER`) in default mode
- **Rebuy:** Selling and rebuying starts a **fresh streak** from zero — no inheritance
- **PLAIN_RECEIVE:** Receiving via wallet transfer starts a new streak (not inherited)

---

## Distribution Mechanics

Top N wallets (default 10) ranked by streak duration:
- **Proportional (default):** payout ∝ time held — hold 3× longer, get ~3× the reward
- **Linear:** rank-based weights (N, N-1, …, 1)
- Anti-sybil filters: min streak age, min balance, per-wallet payout cap
- Rounding: floor to lamports, dust remainder to rank-1

---

## Safety Constraints

- Phases 1–4: **READ ONLY**. No signing, no transactions.
- No private keys hardcoded, logged, or committed.
- Manual claim boundary: pump.fun fee claiming is always a manual human step.
- Full auditability: every payout is reproducible from `raw_transactions` + `transfers`.

See [SECURITY.md](./SECURITY.md) for the full security policy.

---

## Phase Status

| Phase | Status | Description |
|-------|--------|-------------|
| Scaffold | ✅ | Repo setup, DB schema, shared modules |
| Phase 1 | ✅ | Holder snapshot + transfer history ingestion |
| Phase 2 | ✅ | Streak engine with full history table |
| Phase 3 | ✅ | Distribution calculator with SHA256 plan hash |
| Phase 4 | ✅ | Simulator + React/Vite dashboard + Express API |
| Phase 5 | ✅ | Live executor (gated, LIVE_MODE=false default) |
