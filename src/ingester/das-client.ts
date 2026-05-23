import { withRetry } from '../shared/rate-limiter.js';
import type { RateLimiter } from '../shared/rate-limiter.js';
import { logger } from '../shared/logger.js';

export interface DasTokenAccount {
  address: string;    // token account pubkey
  owner: string;      // wallet pubkey
  mint: string;
  amount: string;     // raw units as string (avoids JS number precision issues)
  frozen: boolean;
}

export interface DasMintAsset {
  decimals: number;
  symbol?: string;
  name?: string;
  supply?: string;
}

interface DasTokenAccountsResponse {
  result: {
    total: number;
    page: number;
    items: Array<{
      address: string;
      owner: string;
      mint?: string;
      token_info?: {
        mint?: string;
        amount?: string | number;
        decimals?: number;
        frozen?: boolean;
      };
    }>;
  };
}

/**
 * Async generator that yields pages of token accounts for a given mint.
 * Uses Helius DAS getTokenAccounts RPC method (page-based pagination).
 */
export async function* paginateTokenAccounts(
  dasUrl: string,
  mint: string,
  limiter: RateLimiter,
  pageSize = 1000,
): AsyncGenerator<DasTokenAccount[]> {
  let page = 1;

  while (true) {
    const data = await withRetry(() =>
      limiter.schedule(() =>
        fetchDas<DasTokenAccountsResponse>(dasUrl, 'getTokenAccounts', {
          mint,
          page,
          limit: pageSize,
          options: { showZeroBalance: false },
        }),
      ),
    );

    const items = data.result?.items ?? [];
    if (items.length === 0) break;

    logger.debug({ page, count: items.length }, 'DAS token accounts page');

    const accounts: DasTokenAccount[] = items.map((item) => ({
      address: item.address,
      owner: item.owner,
      mint: item.token_info?.mint ?? mint,
      amount: String(item.token_info?.amount ?? '0'),
      frozen: item.token_info?.frozen ?? false,
    }));

    yield accounts;

    if (items.length < pageSize) break; // last page
    page++;
  }
}

/**
 * Fetches mint metadata via DAS getAsset.
 */
export async function getMintMetadata(
  dasUrl: string,
  mint: string,
  limiter: RateLimiter,
): Promise<DasMintAsset> {
  const data = await withRetry(() =>
    limiter.schedule(() =>
      fetchDas<{ result: { token_info?: { decimals?: number; supply?: string }; content?: { metadata?: { name?: string; symbol?: string } } } }>(
        dasUrl,
        'getAsset',
        { id: mint },
      ),
    ),
  );

  return {
    decimals: data.result?.token_info?.decimals ?? 0,
    symbol: data.result?.content?.metadata?.symbol,
    name: data.result?.content?.metadata?.name,
    supply: data.result?.token_info?.supply,
  };
}

async function fetchDas<T>(dasUrl: string, method: string, params: unknown): Promise<T> {
  const response = await fetch(dasUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 'peanuts-ingester', method, params }),
  });

  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(`DAS API error ${response.status}: ${text}`);
  }

  const json = (await response.json()) as { error?: { message?: string }; result?: unknown };
  if (json.error) {
    throw new Error(`DAS RPC error: ${json.error.message ?? JSON.stringify(json.error)}`);
  }

  return json as T;
}
