import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ── mock config before importing module under test ─────────────────────
vi.mock('../config.js', () => ({
  requireHeliusKey: () => 'fake-helius-key',
  apis: {
    heliusRpc: (key: string) => `https://mainnet.helius-rpc.com/?api-key=${key}`,
  },
  tokens: {
    SOL: 'So11111111111111111111111111111111111111112',
    USDC: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
  },
  getDecimalsFromCache: (mint: string) => {
    const cache: Record<string, number> = {
      'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v': 6,
    };
    return cache[mint];
  },
}));

import { toSmallestUnit, fromSmallestUnit, getTokenDecimals } from './amounts.js';

// ────────────────────────────────────────────────────────────────────────
// toSmallestUnit
// ────────────────────────────────────────────────────────────────────────

describe('toSmallestUnit', () => {
  it('1 SOL → "1000000000"', () => {
    expect(toSmallestUnit(1, 9)).toBe('1000000000');
  });

  it('100 USDC → "100000000"', () => {
    expect(toSmallestUnit(100, 6)).toBe('100000000');
  });

  it('0.000001 SOL → "1000"', () => {
    expect(toSmallestUnit(0.000001, 9)).toBe('1000');
  });

  it('throws on invalid input', () => {
    expect(() => toSmallestUnit('not-a-number', 9)).toThrow('Invalid amount');
    expect(() => toSmallestUnit('', 9)).toThrow('Invalid amount');
  });
});

// ────────────────────────────────────────────────────────────────────────
// fromSmallestUnit
// ────────────────────────────────────────────────────────────────────────

describe('fromSmallestUnit', () => {
  it('"1000000000" with 9 decimals → "1"', () => {
    expect(fromSmallestUnit('1000000000', 9)).toBe('1');
  });

  it('"100000000" with 6 decimals → "100"', () => {
    expect(fromSmallestUnit('100000000', 6)).toBe('100');
  });

  it('throws on invalid input', () => {
    expect(() => fromSmallestUnit('abc', 6)).toThrow('Invalid amount');
  });
});

// ────────────────────────────────────────────────────────────────────────
// getTokenDecimals
// ────────────────────────────────────────────────────────────────────────

describe('getTokenDecimals', () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('returns 9 for native SOL', async () => {
    const decimals = await getTokenDecimals(
      'So11111111111111111111111111111111111111112',
    );
    expect(decimals).toBe(9);
  });

  it('returns cached decimals for USDC (6)', async () => {
    const decimals = await getTokenDecimals(
      'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
    );
    expect(decimals).toBe(6);
  });

  it('fetches from Helius for unknown tokens', async () => {
    const unknownMint = 'UnknownMint111111111111111111111111111111111';
    globalThis.fetch = vi.fn().mockResolvedValue({
      json: async () => ({
        result: { token_info: { decimals: 8 } },
      }),
    });

    const decimals = await getTokenDecimals(unknownMint);
    expect(decimals).toBe(8);

    expect(globalThis.fetch).toHaveBeenCalledOnce();
    const [url, opts] = (globalThis.fetch as any).mock.calls[0];
    expect(url).toContain('helius');
    expect(JSON.parse(opts.body)).toMatchObject({
      method: 'getAsset',
      params: { id: unknownMint },
    });
  });

  it('throws when API fails (does not silently default to 9)', async () => {
    const unknownMint = 'FailMint11111111111111111111111111111111111';
    globalThis.fetch = vi.fn().mockRejectedValue(new Error('network error'));

    await expect(getTokenDecimals(unknownMint)).rejects.toThrow(
      /Failed to fetch token decimals/,
    );
  });

  it('throws when API returns no decimals info', async () => {
    const unknownMint = 'NoDecimals111111111111111111111111111111111';
    globalThis.fetch = vi.fn().mockResolvedValue({
      json: async () => ({ result: {} }),
    });

    await expect(getTokenDecimals(unknownMint)).rejects.toThrow(
      /Failed to fetch token decimals/,
    );
  });
});
