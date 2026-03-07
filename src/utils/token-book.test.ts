import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── fs mock ────────────────────────────────────────────────────────────
const store: Record<string, string> = {};

vi.mock('fs', () => ({
  default: {
    existsSync: vi.fn((p: string) => p in store),
    mkdirSync: vi.fn(),
    writeFileSync: vi.fn((p: string, data: string) => {
      store[p] = data;
    }),
    readFileSync: vi.fn((p: string) => {
      if (!(p in store)) throw new Error(`ENOENT: ${p}`);
      return store[p];
    }),
  },
}));

// ── config mock ────────────────────────────────────────────────────────
vi.mock('../config.js', () => {
  const defaultTokenBook: Record<string, string> = {
    SOL: 'So11111111111111111111111111111111111111112',
    USDC: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
    USDT: 'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB',
    JUP: 'JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN',
  };
  return {
    paths: {
      openclawDir: () => '/fake/.openclaw',
      tokenBook: () => '/fake/.openclaw/trader-tokens.json',
    },
    defaultTokenBook,
  };
});

import {
  resolveToken,
  loadTokenBook,
  saveTokenBook,
} from './token-book.js';

// ────────────────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────────────────
const TOKEN_BOOK_PATH = '/fake/.openclaw/trader-tokens.json';

function clearStore() {
  for (const k of Object.keys(store)) delete store[k];
}

beforeEach(() => {
  clearStore();
});

// ────────────────────────────────────────────────────────────────────────
// resolveToken
// ────────────────────────────────────────────────────────────────────────

describe('resolveToken', () => {
  it('SOL → SOL address', () => {
    expect(resolveToken('SOL')).toBe(
      'So11111111111111111111111111111111111111112',
    );
  });

  it('case-insensitive lookup: "usdc" → USDC address', () => {
    expect(resolveToken('usdc')).toBe(
      'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
    );
  });

  it('valid base58 address passes through', () => {
    const addr = 'So11111111111111111111111111111111111111112';
    expect(resolveToken(addr)).toBe(addr);
  });

  it('invalid long string throws "Invalid Solana address"', () => {
    const bad = 'ZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZ';
    expect(() => resolveToken(bad)).toThrow('Invalid Solana address');
  });
});

// ────────────────────────────────────────────────────────────────────────
// loadTokenBook / saveTokenBook
// ────────────────────────────────────────────────────────────────────────

describe('loadTokenBook', () => {
  it('returns defaults when no file exists', () => {
    const book = loadTokenBook();
    expect(book.SOL).toBe('So11111111111111111111111111111111111111112');
    expect(book.USDC).toBe('EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v');
  });
});

describe('saveTokenBook + loadTokenBook round trip', () => {
  it('persists user additions and merges with defaults', () => {
    const custom = { MYTOKEN: '11111111111111111111111111111111' };
    saveTokenBook(custom);

    // Verify file was written
    expect(store[TOKEN_BOOK_PATH]).toBeDefined();

    const loaded = loadTokenBook();
    // Should contain both defaults and user additions
    expect(loaded.SOL).toBe('So11111111111111111111111111111111111111112');
    expect(loaded.MYTOKEN).toBe('11111111111111111111111111111111');
  });
});
