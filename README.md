# $PEANUTS — Longest-Holder Reward Distribution System

An off-chain service that tracks hold-streaks for $PEANUTS (Solana memecoin) and
distributes claimed creator fees to the longest-surviving holders — not the biggest bags.

> **"Not selling for peanuts"** — loyalty over size.

---

## Architecture

```
Phase 1  Holder snapshot + transfer-history ingestion (READ ONLY)
Phase 2  Streak engine — computes hold-streaks from ingested data
Phase 3  Distribution calculator — produces signed-off JSON payout plans
Phase 4  Simulator + React/Vite holder dashboard
Phase 5  Live executor — gated behind LIVE_MODE=true (BUILD LAST)
```

All phases use SQLite as the source of truth. No private keys until Phase 5.

---

## Quick Start

### 1. Install dependencies

```bash
npm install
```

### 2. Configure environment

```bash
cp .env.example .env
# Edit .env — set HELIUS_API_KEY and TOKEN_MINT_ADDRESS
```

### 3. Run Phase 1 ingestion

```bash
npm run ingest
```

This will:
- Enumerate all current $PEANUTS holders via Helius DAS
- Fetch full transfer history per wallet
- Classify each outbound transfer as SELL or PLAIN_TRANSFER
- Persist everything to `data/peanuts.db`

Re-running is safe — ingestion is idempotent.

### Force re-ingest

```bash
npm run ingest -- --force
```

### 4. Run tests

```bash
npm test
```

### 5. Type-check

```bash
npm run build
```

---

## Database

SQLite file lives at `data/peanuts.db` (gitignored). Back it up before each payout run.

Key tables:
- `holders` — current snapshot of all token holders + balances
- `transfers` — append-only wallet-centric transfer event log
- `raw_transactions` — full Helius enhanced TX JSON per signature (audit trail)
- `ingestion_cursors` — pagination state per wallet (enables resumable ingestion)
- `snapshot_log` — immutable log of every snapshot run

---

## Folder Structure

```
src/
  db/           Database client, migration runner, typed queries
  ingester/     Phase 1: Helius clients, snapshot, history, classify, orchestrator
  streak/       Phase 2: Streak engine (coming)
  calculator/   Phase 3: Distribution math (coming)
  api/          Phase 4: Express API (coming)
  simulator/    Phase 4: Synthetic data harness (coming)
  shared/       Types, logger, config validator, rate limiter
config/
  dex-programs.json   DEX program ID allowlist (extend without code changes)
packages/
  dashboard/    Phase 4: React/Vite holder dashboard (coming)
scripts/
  run-ingester.ts     Phase 1 CLI entry point
```

---

## Safety Constraints

- **Phases 1–4: READ ONLY.** Nothing signs or sends transactions.
- **No private keys** hardcoded, logged, or committed anywhere.
- **Manual claim boundary:** pump.fun creator fee claiming is always a manual human step.
- **Full auditability:** every payout decision is reproducible from `raw_transactions`.

See [SECURITY.md](./SECURITY.md) for the full security policy.

---

## DEX Classification

Outbound transfers are classified as `SELL` if the transaction involved a known DEX.
The allowlist lives in `config/dex-programs.json` — add new programs without code changes.

Classification uses Helius `tx.source` as the primary signal (most reliable) and falls
back to instruction program ID matching. See `src/ingester/classify.ts`.

---

## Phase Status

| Phase | Status | Description |
|-------|--------|-------------|
| Scaffold | ✅ Complete | Repo setup, DB schema, shared modules |
| Phase 1 | ✅ Complete | Holder snapshot + transfer history ingestion |
| Phase 2 | 🔜 Next | Streak engine |
| Phase 3 | ⏳ Pending | Distribution calculator |
| Phase 4 | ⏳ Pending | Simulator + dashboard |
| Phase 5 | ⏳ Pending | Live executor (gated) |
