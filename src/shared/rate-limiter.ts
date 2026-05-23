import pLimit from 'p-limit';

export interface RateLimiter {
  schedule<T>(fn: () => Promise<T>): Promise<T>;
}

interface TokenBucketOptions {
  requestsPerSecond: number;
  concurrency: number;
}

export function createRateLimiter(opts: TokenBucketOptions): RateLimiter {
  const limit = pLimit(opts.concurrency);
  const minIntervalMs = 1000 / opts.requestsPerSecond;
  let lastCallTime = 0;

  return {
    schedule<T>(fn: () => Promise<T>): Promise<T> {
      return limit(async () => {
        const now = Date.now();
        const elapsed = now - lastCallTime;
        if (elapsed < minIntervalMs) {
          await sleep(minIntervalMs - elapsed);
        }
        lastCallTime = Date.now();
        return fn();
      });
    },
  };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Retry with exponential backoff for 429 / transient errors
export async function withRetry<T>(
  fn: () => Promise<T>,
  maxAttempts = 5,
  baseDelayMs = 1000,
): Promise<T> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      if (attempt === maxAttempts) break;
      const delay = baseDelayMs * Math.pow(2, attempt - 1) * (0.75 + Math.random() * 0.5);
      await sleep(delay);
    }
  }
  throw lastError;
}
