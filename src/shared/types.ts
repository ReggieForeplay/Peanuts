// Core domain types for $PEANUTS holder tracking

export interface MintInfoRow {
  mint_address: string;
  decimals: number;
  symbol: string | null;
  name: string | null;
  total_supply: bigint;
  updated_at: number; // unix seconds
}

export interface HolderRow {
  wallet: string;
  balance: bigint;
  token_account: string;
  snapshot_slot: number;
  snapshot_time: number; // unix seconds
}

export interface RawTransactionRow {
  signature: string;
  slot: number;
  block_time: number; // unix seconds
  raw_json: string;
}

export type TransferDirection = 'INBOUND' | 'OUTBOUND';
export type TransferClassification = 'BUY' | 'PLAIN_RECEIVE' | 'SELL' | 'PLAIN_TRANSFER';

export interface TransferRow {
  id?: number;
  signature: string;
  slot: number;
  block_time: number; // unix seconds
  wallet: string;
  direction: TransferDirection;
  amount: bigint;
  counterparty: string | null;
  classification: TransferClassification | null;
}

export interface CursorRow {
  wallet: string;
  last_signature: string | null;
  fully_ingested: number; // 0 | 1
  updated_at: number; // unix seconds
}

export interface SnapshotLogRow {
  id?: number;
  taken_at: number; // unix seconds
  mint_address: string;
  holder_count: number;
  total_supply: bigint;
}

export interface SnapshotResult {
  holderCount: number;
  totalSupply: bigint;
  snapshotTime: number;
}

// Classification result from classify.ts
export interface ClassifyResult {
  direction: TransferDirection;
  amount: bigint;
  counterparty: string | null;
  classification: TransferClassification;
}

// DEX programs config shape
export interface DexProgramsConfig {
  sources: Record<string, string>;
  programs: Record<string, { name: string; source: string }>;
}
