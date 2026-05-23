import { withRetry } from '../shared/rate-limiter.js';
import type { RateLimiter } from '../shared/rate-limiter.js';
import { logger } from '../shared/logger.js';
import type { HeliusEnhancedTx } from './classify.js';

const PAGE_LIMIT = 100; // Helius max per request for enhanced transactions

/**
 * Async generator that yields pages of enhanced transactions for a wallet.
 * Paginates backwards (most recent → oldest) via the `before` query parameter.
 *
 * @param beforeSignature - Resume from this signature (exclusive). Pass null to start from latest.
 */
export async function* paginateTransactionHistory(
  enhancedBaseUrl: string,
  apiKey: string,
  wallet: string,
  beforeSignature: string | null,
  limiter: RateLimiter,
): AsyncGenerator<HeliusEnhancedTx[]> {
  let before: string | null = beforeSignature;

  while (true) {
    const url = buildUrl(enhancedBaseUrl, apiKey, wallet, before);

    const txs = await withRetry(() =>
      limiter.schedule(() => fetchEnhanced(url)),
    );

    if (txs.length === 0) break;

    logger.debug({ wallet, count: txs.length, oldestSlot: txs[txs.length - 1]?.slot }, 'Enhanced TX page');

    yield txs;

    if (txs.length < PAGE_LIMIT) break; // last page

    // The oldest signature in this page becomes the cursor for the next call
    before = txs[txs.length - 1].signature;
  }
}

function buildUrl(
  baseUrl: string,
  apiKey: string,
  wallet: string,
  before: string | null,
): string {
  const url = new URL(`${baseUrl}/addresses/${wallet}/transactions`);
  url.searchParams.set('api-key', apiKey);
  url.searchParams.set('limit', String(PAGE_LIMIT));
  url.searchParams.set('type', 'TRANSFER'); // only fetch token transfer transactions
  if (before) {
    url.searchParams.set('before', before);
  }
  return url.toString();
}

async function fetchEnhanced(url: string): Promise<HeliusEnhancedTx[]> {
  // Redact API key from logs
  const logUrl = url.replace(/api-key=[^&]+/, 'api-key=REDACTED');

  const response = await fetch(url);

  if (response.status === 429) {
    throw new Error(`Rate limited by Helius (429) fetching ${logUrl}`);
  }

  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(`Helius enhanced API error ${response.status} at ${logUrl}: ${text}`);
  }

  return response.json() as Promise<HeliusEnhancedTx[]>;
}
