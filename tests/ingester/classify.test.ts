import { describe, it, expect } from 'vitest';
import { classifyTransaction } from '../../src/ingester/classify.js';
import type { HeliusEnhancedTx } from '../../src/ingester/classify.js';
import type { DexProgramsConfig } from '../../src/shared/types.js';
import fixtures from '../fixtures/helius-enhanced-txs.json' with { type: 'json' };

const MINT = 'PEANUTS_MINT';
const ALICE = 'wallet_alice';

const dexPrograms: DexProgramsConfig = {
  sources: { RAYDIUM: 'Raydium', JUPITER: 'Jupiter' },
  programs: {
    '675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8': { name: 'Raydium AMM v4', source: 'RAYDIUM' },
    'JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4': { name: 'Jupiter v6', source: 'JUPITER' },
  },
};

const txs = fixtures as HeliusEnhancedTx[];

describe('classifyTransaction', () => {
  it('classifies a Jupiter swap inbound as BUY', () => {
    const tx = txs.find((t) => t.signature === 'sig_buy_jupiter')!;
    const results = classifyTransaction({ tx, wallet: ALICE, mint: MINT, dexPrograms });
    expect(results).toHaveLength(1);
    expect(results[0].classification).toBe('BUY');
    expect(results[0].direction).toBe('INBOUND');
    expect(results[0].amount).toBe(5000n);
    expect(results[0].counterparty).toBe('dex_pool_1');
  });

  it('classifies a Jupiter swap outbound as SELL', () => {
    const tx = txs.find((t) => t.signature === 'sig_sell_jupiter')!;
    const results = classifyTransaction({ tx, wallet: ALICE, mint: MINT, dexPrograms });
    expect(results).toHaveLength(1);
    expect(results[0].classification).toBe('SELL');
    expect(results[0].direction).toBe('OUTBOUND');
    expect(results[0].amount).toBe(2000n);
  });

  it('classifies wallet-to-wallet inbound as PLAIN_RECEIVE', () => {
    const tx = txs.find((t) => t.signature === 'sig_plain_receive')!;
    const results = classifyTransaction({ tx, wallet: ALICE, mint: MINT, dexPrograms });
    expect(results).toHaveLength(1);
    expect(results[0].classification).toBe('PLAIN_RECEIVE');
    expect(results[0].counterparty).toBe('wallet_bob');
  });

  it('classifies wallet-to-wallet outbound as PLAIN_TRANSFER', () => {
    const tx = txs.find((t) => t.signature === 'sig_plain_transfer')!;
    const results = classifyTransaction({ tx, wallet: ALICE, mint: MINT, dexPrograms });
    expect(results).toHaveLength(1);
    expect(results[0].classification).toBe('PLAIN_TRANSFER');
    expect(results[0].counterparty).toBe('wallet_charlie');
  });

  it('returns empty array when no PEANUTS transfers exist', () => {
    const tx = txs.find((t) => t.signature === 'sig_no_peanuts')!;
    const results = classifyTransaction({ tx, wallet: ALICE, mint: MINT, dexPrograms });
    expect(results).toHaveLength(0);
  });

  it('falls back to program ID check when tx.source is UNKNOWN', () => {
    const tx = txs.find((t) => t.signature === 'sig_raydium_fallback')!;
    const results = classifyTransaction({ tx, wallet: ALICE, mint: MINT, dexPrograms });
    expect(results).toHaveLength(1);
    expect(results[0].classification).toBe('SELL');
  });

  it('filters out zero-amount transfers', () => {
    const tx = txs.find((t) => t.signature === 'sig_zero_amount')!;
    const results = classifyTransaction({ tx, wallet: ALICE, mint: MINT, dexPrograms });
    expect(results).toHaveLength(0);
  });

  it('returns empty when the wallet is not involved in the transfer', () => {
    const tx = txs.find((t) => t.signature === 'sig_plain_receive')!;
    // wallet_charlie is not involved in this tx
    const results = classifyTransaction({ tx, wallet: 'wallet_charlie', mint: MINT, dexPrograms });
    expect(results).toHaveLength(0);
  });

  it('handles multiple token transfers in one tx for the same wallet', () => {
    const tx: HeliusEnhancedTx = {
      signature: 'sig_multi',
      slot: 9000,
      timestamp: 1700009000,
      source: 'JUPITER',
      tokenTransfers: [
        { fromUserAccount: 'dex_pool_1', toUserAccount: ALICE, mint: MINT, tokenAmount: '100' },
        { fromUserAccount: ALICE, toUserAccount: 'dex_pool_1', mint: MINT, tokenAmount: '50' },
      ],
    };
    const results = classifyTransaction({ tx, wallet: ALICE, mint: MINT, dexPrograms });
    expect(results).toHaveLength(2);
    expect(results.find((r) => r.direction === 'INBOUND')!.classification).toBe('BUY');
    expect(results.find((r) => r.direction === 'OUTBOUND')!.classification).toBe('SELL');
  });
});
