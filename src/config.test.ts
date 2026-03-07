import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  requirePassword,
  requireHeliusKey,
  requireJupiterKey,
  getRpcUrl,
  getDecimalsFromCache,
  tokens,
  apis,
} from './config.js';

// ────────────────────────────────────────────────────────────────────────
// Helpers — save/restore env
// ────────────────────────────────────────────────────────────────────────

const ENVS_TO_MANAGE = [
  'WALLET_PASSWORD',
  'HELIUS_API_KEY',
  'JUPITER_API_KEY',
  'RPC_URL',
] as const;

let savedEnv: Record<string, string | undefined>;

beforeEach(() => {
  savedEnv = {};
  for (const key of ENVS_TO_MANAGE) {
    savedEnv[key] = process.env[key];
    delete process.env[key];
  }
});

afterEach(() => {
  for (const key of ENVS_TO_MANAGE) {
    if (savedEnv[key] !== undefined) {
      process.env[key] = savedEnv[key];
    } else {
      delete process.env[key];
    }
  }
});

// ────────────────────────────────────────────────────────────────────────
// requirePassword
// ────────────────────────────────────────────────────────────────────────

describe('requirePassword', () => {
  it('throws when WALLET_PASSWORD not set', () => {
    expect(() => requirePassword()).toThrow('WALLET_PASSWORD');
  });

  it('returns password when set', () => {
    process.env.WALLET_PASSWORD = 'my-secret';
    expect(requirePassword()).toBe('my-secret');
  });
});

// ────────────────────────────────────────────────────────────────────────
// requireHeliusKey
// ────────────────────────────────────────────────────────────────────────

describe('requireHeliusKey', () => {
  it('throws when HELIUS_API_KEY not set', () => {
    expect(() => requireHeliusKey()).toThrow('HELIUS_API_KEY');
  });

  it('returns key when set', () => {
    process.env.HELIUS_API_KEY = 'hk-123';
    expect(requireHeliusKey()).toBe('hk-123');
  });
});

// ────────────────────────────────────────────────────────────────────────
// requireJupiterKey
// ────────────────────────────────────────────────────────────────────────

describe('requireJupiterKey', () => {
  it('throws when JUPITER_API_KEY not set', () => {
    expect(() => requireJupiterKey()).toThrow('JUPITER_API_KEY');
  });

  it('returns key when set', () => {
    process.env.JUPITER_API_KEY = 'jk-456';
    expect(requireJupiterKey()).toBe('jk-456');
  });
});

// ────────────────────────────────────────────────────────────────────────
// getRpcUrl
// ────────────────────────────────────────────────────────────────────────

describe('getRpcUrl', () => {
  it('prefers RPC_URL when set', () => {
    process.env.RPC_URL = 'https://custom-rpc.example.com';
    process.env.HELIUS_API_KEY = 'hk-123';
    expect(getRpcUrl()).toBe('https://custom-rpc.example.com');
  });

  it('falls back to Helius when RPC_URL not set', () => {
    process.env.HELIUS_API_KEY = 'hk-123';
    expect(getRpcUrl()).toBe(apis.heliusRpc('hk-123'));
  });

  it('falls back to public mainnet when nothing set', () => {
    expect(getRpcUrl()).toBe(apis.solanaMainnet);
  });
});

// ────────────────────────────────────────────────────────────────────────
// getDecimalsFromCache
// ────────────────────────────────────────────────────────────────────────

describe('getDecimalsFromCache', () => {
  it('returns cached decimals for known tokens', () => {
    expect(getDecimalsFromCache(tokens.SOL)).toBe(9);
    expect(getDecimalsFromCache(tokens.USDC)).toBe(6);
    expect(getDecimalsFromCache(tokens.USDT)).toBe(6);
    expect(getDecimalsFromCache(tokens.WBTC)).toBe(8);
    expect(getDecimalsFromCache(tokens.WETH)).toBe(8);
    expect(getDecimalsFromCache(tokens.JUP)).toBe(6);
  });

  it('returns undefined for unknown tokens', () => {
    expect(getDecimalsFromCache('UnknownMintAddress1111111111111111111')).toBeUndefined();
  });
});
