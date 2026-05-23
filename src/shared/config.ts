import { z } from 'zod';
import path from 'path';

const schema = z.object({
  HELIUS_API_KEY: z.string().min(1, 'HELIUS_API_KEY is required'),
  TOKEN_MINT_ADDRESS: z.string().min(32, 'TOKEN_MINT_ADDRESS must be a valid Solana address'),
  DB_PATH: z.string().default('./data/peanuts.db'),
  LOG_LEVEL: z.enum(['trace', 'debug', 'info', 'warn', 'error']).default('info'),
  INGESTION_CONCURRENCY: z.coerce.number().int().min(1).max(20).default(3),
  HELIUS_RPS: z.coerce.number().int().min(1).max(100).default(10),
  API_PORT: z.coerce.number().int().min(1024).max(65535).default(3001),
});

function loadConfig() {
  const result = schema.safeParse(process.env);
  if (!result.success) {
    const errors = result.error.errors.map((e) => `  ${e.path.join('.')}: ${e.message}`).join('\n');
    throw new Error(`Configuration error — check your .env file:\n${errors}`);
  }
  const env = result.data;
  return {
    heliusApiKey: env.HELIUS_API_KEY,
    heliusDasUrl: `https://mainnet.helius-rpc.com/?api-key=${env.HELIUS_API_KEY}`,
    heliusEnhancedUrl: `https://api.helius.xyz/v0`,
    mintAddress: env.TOKEN_MINT_ADDRESS,
    dbPath: path.resolve(env.DB_PATH),
    logLevel: env.LOG_LEVEL,
    concurrency: env.INGESTION_CONCURRENCY,
    rateLimitRps: env.HELIUS_RPS,
    apiPort: env.API_PORT,
  } as const;
}

// Lazily loaded so tests can set process.env before importing
let _config: ReturnType<typeof loadConfig> | null = null;

export function getConfig() {
  if (!_config) {
    _config = loadConfig();
  }
  return _config;
}

// Reset for tests
export function resetConfig() {
  _config = null;
}

export type Config = ReturnType<typeof loadConfig>;
