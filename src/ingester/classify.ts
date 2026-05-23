import type { ClassifyResult, DexProgramsConfig, TransferClassification } from '../shared/types.js';

// Helius tx.source values that indicate a DEX interaction
// These are the primary classification signal — Helius sets them for recognized protocols
const DEX_SOURCES = new Set([
  'RAYDIUM',
  'JUPITER',
  'ORCA',
  'PUMP_FUN',
  'PUMP_AMM',
  'METEORA',
  'OPENBOOK',
  'SERUM',
  'STEP_FINANCE',
  'ALDRIN',
  'CREMA',
  'LIFINITY',
  'CYKURA',
  'MARINADE',
  'SABER',
  'MERCURIAL',
]);

// Minimal shapes of Helius Enhanced Transaction fields we need for classification
export interface HeliusTokenTransfer {
  fromUserAccount?: string;
  toUserAccount?: string;
  mint: string;
  tokenAmount: number | string;
}

export interface HeliusInstruction {
  programId: string;
  accounts?: string[];
  data?: string;
}

export interface HeliusEnhancedTx {
  signature: string;
  slot: number;
  timestamp: number; // block_time in unix seconds
  source?: string;   // e.g. "RAYDIUM", "JUPITER", "UNKNOWN"
  tokenTransfers?: HeliusTokenTransfer[];
  instructions?: HeliusInstruction[];
  nativeTransfers?: unknown[];
}

export interface ClassifyOptions {
  tx: HeliusEnhancedTx;
  wallet: string;
  mint: string;
  dexPrograms: DexProgramsConfig;
}

/**
 * Pure function: given one Helius Enhanced Transaction and a wallet address,
 * returns zero or more ClassifyResult entries (one per token transfer involving this wallet).
 *
 * Classification priority:
 * 1. tx.source field (Helius sets this for recognized DEX protocols — most reliable)
 * 2. Fallback: check tx.instructions for known DEX program IDs from dex-programs.json
 */
export function classifyTransaction(opts: ClassifyOptions): ClassifyResult[] {
  const { tx, wallet, mint, dexPrograms } = opts;
  const results: ClassifyResult[] = [];

  if (!tx.tokenTransfers || tx.tokenTransfers.length === 0) return results;

  // Determine if this tx involved a DEX (primary signal then fallback)
  const isDex = isDexTransaction(tx, dexPrograms);

  for (const transfer of tx.tokenTransfers) {
    if (transfer.mint !== mint) continue;

    const isInbound = transfer.toUserAccount === wallet;
    const isOutbound = transfer.fromUserAccount === wallet;

    if (!isInbound && !isOutbound) continue;

    const rawAmount =
      typeof transfer.tokenAmount === 'string'
        ? transfer.tokenAmount
        : transfer.tokenAmount.toString();

    const amount = BigInt(Math.round(parseFloat(rawAmount)));
    if (amount === 0n) continue; // ignore zero-amount noise

    const direction = isInbound ? 'INBOUND' : 'OUTBOUND';
    const counterparty = isInbound
      ? (transfer.fromUserAccount ?? null)
      : (transfer.toUserAccount ?? null);

    let classification: TransferClassification;
    if (isDex) {
      classification = direction === 'INBOUND' ? 'BUY' : 'SELL';
    } else {
      classification = direction === 'INBOUND' ? 'PLAIN_RECEIVE' : 'PLAIN_TRANSFER';
    }

    results.push({ direction, amount, counterparty, classification });
  }

  return results;
}

function isDexTransaction(tx: HeliusEnhancedTx, dexPrograms: DexProgramsConfig): boolean {
  // Primary: Helius tx.source (handles protocol upgrades and wrapped routers automatically)
  if (tx.source && DEX_SOURCES.has(tx.source.toUpperCase())) return true;

  // Fallback: scan instruction program IDs against our allowlist
  if (tx.instructions) {
    for (const ix of tx.instructions) {
      if (ix.programId in dexPrograms.programs) return true;
    }
  }

  return false;
}

/**
 * Loads the DEX programs config. Call once at startup, pass to classifyTransaction.
 */
export async function loadDexPrograms(configPath: string): Promise<DexProgramsConfig> {
  const { default: config } = await import(configPath, { with: { type: 'json' } });
  return config as DexProgramsConfig;
}
