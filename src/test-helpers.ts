/**
 * Shared test helpers — mock factories for fetch, fs, env, wallet, etc.
 */
import { vi } from 'vitest';

// ============================================================================
// Environment setup
// ============================================================================

export function setupTestEnv(overrides: Record<string, string> = {}) {
  const defaults: Record<string, string> = {
    WALLET_PASSWORD: 'test-password-123',
    HELIUS_API_KEY: 'test-helius-key',
    JUPITER_API_KEY: 'test-jupiter-key',
    HOME: '/tmp/trader-test',
  };
  for (const [k, v] of Object.entries({ ...defaults, ...overrides })) {
    process.env[k] = v;
  }
}

export function clearTestEnv() {
  delete process.env.WALLET_PASSWORD;
  delete process.env.HELIUS_API_KEY;
  delete process.env.JUPITER_API_KEY;
}

// ============================================================================
// Fetch mock helpers
// ============================================================================

export function mockFetchJson(data: any, status = 200) {
  return vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(data),
    text: () => Promise.resolve(JSON.stringify(data)),
  });
}

export function mockFetchSequence(responses: Array<{ data: any; status?: number }>) {
  const fn = vi.fn();
  for (let i = 0; i < responses.length; i++) {
    const { data, status = 200 } = responses[i];
    fn.mockResolvedValueOnce({
      ok: status >= 200 && status < 300,
      status,
      json: () => Promise.resolve(data),
      text: () => Promise.resolve(JSON.stringify(data)),
    });
  }
  return fn;
}

// ============================================================================
// Common mock data
// ============================================================================

export const MOCK_WALLET_ADDRESS = 'GAGbjkK8a2J1swCCmFANrxaaKXGiJ1BCbaLf6tNFtn2T';

export const MOCK_PORTFOLIO = {
  totalValueUsd: 1000,
  tokens: [
    { name: 'Solana', symbol: 'SOL', mint: 'So11111111111111111111111111111111111111112', balance: 5, decimals: 9, valueUsd: 500, pricePerToken: 100 },
    { name: 'USD Coin', symbol: 'USDC', mint: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v', balance: 500, decimals: 6, valueUsd: 500, pricePerToken: 1 },
  ],
};

export const MOCK_SWAP_QUOTE = {
  inputMint: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
  outputMint: 'So11111111111111111111111111111111111111112',
  inAmount: '100000000',
  outAmount: '1000000000',
  priceImpactPct: 0.001,
  transaction: 'dGVzdC10cmFuc2FjdGlvbg==', // base64 "test-transaction"
  requestId: 'test-request-id',
};

export const MOCK_PREDICTION_MARKET = {
  marketId: 'MARKET-123',
  metadata: { title: 'Test Market' },
  pricing: {
    buyYesPriceUsd: 500000,
    buyNoPriceUsd: 500000,
    sellYesPriceUsd: 490000,
    sellNoPriceUsd: 490000,
  },
};

export const MOCK_PREDICTION_ORDER = {
  order: {
    contracts: '10',
    orderCostUsd: '5000000',
    estimatedTotalFeeUsd: '100000',
    orderPubkey: 'order-pubkey-123',
  },
  transaction: 'dGVzdC10cmFuc2FjdGlvbg==',
};

export const MOCK_PERP_POOL = {
  poolStats: {
    totalAum: 500000000,
    longPositions: 100000000,
    shortPositions: 50000000,
  },
};

// ============================================================================
// Capture console output
// ============================================================================

export function captureConsole() {
  const logs: string[] = [];
  const errors: string[] = [];
  const warns: string[] = [];

  const origLog = console.log;
  const origError = console.error;
  const origWarn = console.warn;

  console.log = (...args: any[]) => logs.push(args.map(String).join(' '));
  console.error = (...args: any[]) => errors.push(args.map(String).join(' '));
  console.warn = (...args: any[]) => warns.push(args.map(String).join(' '));

  return {
    logs,
    errors,
    warns,
    restore() {
      console.log = origLog;
      console.error = origError;
      console.warn = origWarn;
    },
    /** Get all log output joined */
    output() { return logs.join('\n'); },
    /** Parse the first JSON log line */
    json() {
      const jsonLine = logs.find(l => l.startsWith('{') || l.startsWith('['));
      return jsonLine ? JSON.parse(jsonLine) : null;
    },
  };
}
