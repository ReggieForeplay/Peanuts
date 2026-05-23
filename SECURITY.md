# Security Policy

## Scope

$PEANUTS is a **read-only off-chain service** in Phases 1–4. It reads from the Solana
blockchain and writes to a local SQLite database. It does NOT sign, submit, or simulate
any on-chain transactions. It does NOT hold, control, or have access to any wallet private keys.

---

## 1. Secrets Management

- `.env` contains your Helius API key. It is `.gitignore`d and must **never** be committed.
- The Helius API key is used only for read-only RPC calls. If exposed, an attacker can
  read blockchain data — they **cannot** move funds or write to any chain state.
- `HELIUS_API_KEY` is **never logged**. The config loader redacts it from all Pino output.
- Rotate your Helius API key immediately at https://dev.helius.xyz if you suspect exposure.

---

## 2. No Private Keys — Ever (Until Phase 5)

- Phases 1–4 require **zero** private keys.
- Phase 5 (future) will require a signing key for SOL disbursement. It will load **only**
  from env, never hardcoded or logged. Phase 5 has a mandatory dry-run step and a
  human-readable confirmation prompt before any transfer is sent.
- If you encounter a code path in Phases 1–4 that requests a private key, that is a bug —
  please report it immediately.

---

## 3. Manual Claim Boundary

The claim of creator fees from pump.fun is **entirely manual and human-performed**.
This service:
- Does NOT interact with the pump.fun claim interface.
- Does NOT have access to the creator wallet.
- Does NOT automate any part of the fee collection process.

The intended flow is:
1. You manually claim fees on pump.fun → SOL lands in your wallet.
2. You run the distribution calculator → it produces a signed-off JSON plan.
3. You review the plan.
4. You run the executor (Phase 5, LIVE_MODE=false by default) → dry-run prints what would be sent.
5. You set LIVE_MODE=true → you confirm the total and recipient count → transfers execute.

---

## 4. Data Integrity and Auditability

Every payout decision is **fully reproducible** from the database alone.

- `raw_transactions` stores full Helius enhanced JSON per tx signature. Classifications
  can be re-derived from this data at any time.
- `transfers` is **append-only**. Rows are never updated or deleted after insertion.
- `snapshot_log` is an immutable audit trail of every holder snapshot.
- SQLite WAL mode ensures writes are durable even if the process crashes mid-ingestion.
- Back up `data/peanuts.db` before every payout run.

---

## 5. Anti-Sybil Limitations

The Phase 3 calculator includes configurable guardrails (minimum streak age, minimum balance,
max payout share per wallet). These **reduce but do not eliminate** sybil risk.

**Known limitations (by design, not bugs):**
- A well-resourced actor can create multiple wallets that each accumulate a real hold streak.
  No on-chain identity system prevents this.
- Wallet-to-wallet transfers do not break streaks by default. An actor could shuffle tokens
  between wallets they control without resetting streaks. `STRICT_MODE` can be enabled to
  treat any outbound transfer as a streak break, at the cost of penalising legitimate
  self-custody moves.
- DEX classification relies on Helius `tx.source` and a program-ID allowlist. A novel AMM
  not yet in the allowlist would be misclassified as a PLAIN_TRANSFER. Extend
  `config/dex-programs.json` as new DEXes emerge.

These limitations are documented honestly. Tune the eligibility filters in the calculator
to match your risk tolerance.

---

## 6. Dependency Security

- Run `npm audit` before each release or payout run.
- `better-sqlite3` requires a native addon. It is widely used and maintained; its build
  is reproducible via npm. Do not override it with a fork without review.
- Do not add dependencies with native code execution requirements without explicit review.

---

## 7. Reporting a Vulnerability

Please report security issues **privately** before public disclosure.

Contact: [add your contact email or GitHub security advisory URL here]

Do **not** open a public GitHub issue for security vulnerabilities — this gives attackers
advance notice before a fix is available.
