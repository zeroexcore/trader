import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import crypto from 'crypto';
import { Keypair, PublicKey } from '@solana/web3.js';

// ── fs mock ────────────────────────────────────────────────────────────
// Track what gets written so we can feed it back on reads
const store: Record<string, { data: string; mode?: number }> = {};

vi.mock('fs', () => ({
  default: {
    existsSync: vi.fn((p: string) => p in store),
    mkdirSync: vi.fn(),
    writeFileSync: vi.fn((p: string, data: string, opts?: any) => {
      store[p] = { data, mode: opts?.mode };
    }),
    readFileSync: vi.fn((p: string) => {
      if (!(p in store)) throw new Error(`ENOENT: ${p}`);
      return store[p].data;
    }),
  },
}));

// ── paths mock ─────────────────────────────────────────────────────────
vi.mock('../config.js', () => ({
  paths: {
    openclawDir: () => '/fake/.openclaw',
    walletFile: () => '/fake/.openclaw/trader-wallet.enc',
  },
}));

// Now import the module under test (after mocks are hoisted)
import {
  generateWallet,
  loadKeypairForSigning,
  getWalletAddress,
  exportPrivateKey,
} from './wallet.js';

// ────────────────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────────────────
const PASSWORD = 'test-password-123';
const WALLET_PATH = '/fake/.openclaw/trader-wallet.enc';

function clearStore() {
  for (const k of Object.keys(store)) delete store[k];
}

// Build a legacy encrypted blob (no salt field, uses static 'salt')
function buildLegacyEncrypted(keypair: Keypair): object {
  const key = crypto.scryptSync(PASSWORD, 'salt', 32, { N: 16384, r: 8, p: 1 });
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const secretKey = Buffer.from(keypair.secretKey);
  let encrypted = cipher.update(secretKey);
  encrypted = Buffer.concat([encrypted, cipher.final()]);
  const authTag = cipher.getAuthTag();

  return {
    // intentionally omit `salt`
    iv: iv.toString('hex'),
    authTag: authTag.toString('hex'),
    encrypted: encrypted.toString('hex'),
  };
}

// ────────────────────────────────────────────────────────────────────────
// Tests
// ────────────────────────────────────────────────────────────────────────

describe('wallet', () => {
  beforeEach(() => {
    clearStore();
  });

  afterEach(() => {
    clearStore();
    // Clean agent-related env vars
    delete process.env.OPENCLAW_SESSION;
    delete process.env.OPENCLAW_AGENT;
  });

  // ── generateWallet ──────────────────────────────────────────────────

  it('creates a wallet, writes encrypted JSON with mode 0o600, returns a PublicKey', () => {
    const pubkey = generateWallet(PASSWORD);

    // Returns a PublicKey instance
    expect(pubkey).toBeInstanceOf(PublicKey);

    // File was written
    expect(store[WALLET_PATH]).toBeDefined();
    expect(store[WALLET_PATH].mode).toBe(0o600);

    // File content is valid JSON with expected fields
    const parsed = JSON.parse(store[WALLET_PATH].data);
    expect(parsed).toHaveProperty('salt');
    expect(parsed).toHaveProperty('iv');
    expect(parsed).toHaveProperty('authTag');
    expect(parsed).toHaveProperty('encrypted');
  });

  it('throws if wallet already exists', () => {
    // Pre-populate the store so the file "exists"
    store[WALLET_PATH] = { data: '{}' };

    expect(() => generateWallet(PASSWORD)).toThrow('Wallet already exists');
  });

  // ── loadKeypairForSigning ───────────────────────────────────────────

  it('decrypts and returns the same keypair that was encrypted', () => {
    const pubkey = generateWallet(PASSWORD);
    const keypair = loadKeypairForSigning(PASSWORD);

    expect(keypair).toBeInstanceOf(Keypair);
    expect(keypair.publicKey.toBase58()).toBe(pubkey.toBase58());
    // Verify the secret key round-trips (64 bytes)
    expect(keypair.secretKey).toHaveLength(64);
  });

  // ── getWalletAddress ────────────────────────────────────────────────

  it('returns a base58 address string', () => {
    const pubkey = generateWallet(PASSWORD);
    const address = getWalletAddress(PASSWORD);

    expect(typeof address).toBe('string');
    expect(address).toBe(pubkey.toBase58());
    // Base58 addresses are 32-44 chars
    expect(address.length).toBeGreaterThanOrEqual(32);
    expect(address.length).toBeLessThanOrEqual(44);
  });

  // ── encryptKeypair + decryptKeypair (salt field) ────────────────────

  it('new wallets have a random salt field (not the static string "salt")', () => {
    generateWallet(PASSWORD);
    const parsed = JSON.parse(store[WALLET_PATH].data);

    // salt should be a hex string from randomBytes(32) = 64 hex chars
    expect(parsed.salt).toBeDefined();
    expect(typeof parsed.salt).toBe('string');
    expect(parsed.salt.length).toBe(64);
    // Must not be the hex encoding of the literal word "salt"
    expect(parsed.salt).not.toBe(Buffer.from('salt').toString('hex'));
  });

  // ── backward compat (legacy format, no salt field) ──────────────────

  it('legacy format (no salt field) still decrypts correctly', () => {
    const originalKeypair = Keypair.generate();
    const legacy = buildLegacyEncrypted(originalKeypair);

    // Write legacy blob into the virtual FS
    store[WALLET_PATH] = { data: JSON.stringify(legacy) };

    const loaded = loadKeypairForSigning(PASSWORD);
    expect(loaded.publicKey.toBase58()).toBe(originalKeypair.publicKey.toBase58());
    expect(Buffer.from(loaded.secretKey)).toEqual(Buffer.from(originalKeypair.secretKey));
  });

  // ── requireManualConfirmation (via exportPrivateKey) ─────────────────

  it('exportPrivateKey blocks when OPENCLAW_SESSION is set', async () => {
    generateWallet(PASSWORD);
    process.env.OPENCLAW_SESSION = 'some-session';

    await expect(exportPrivateKey(PASSWORD)).rejects.toThrow(
      /cannot be run via agent/i,
    );
  });

  it('exportPrivateKey blocks when stdin is not TTY', async () => {
    generateWallet(PASSWORD);
    // Ensure no agent env vars
    delete process.env.OPENCLAW_SESSION;
    // process.stdin.isTTY is undefined/false in test environment
    const origIsTTY = process.stdin.isTTY;
    Object.defineProperty(process.stdin, 'isTTY', { value: false, configurable: true });

    try {
      await expect(exportPrivateKey(PASSWORD)).rejects.toThrow(
        /requires an interactive terminal/i,
      );
    } finally {
      Object.defineProperty(process.stdin, 'isTTY', {
        value: origIsTTY,
        configurable: true,
      });
    }
  });

  it('exportPrivateKey blocked in agent environment (OPENCLAW_AGENT)', async () => {
    generateWallet(PASSWORD);
    process.env.OPENCLAW_AGENT = 'true';

    await expect(exportPrivateKey(PASSWORD)).rejects.toThrow(
      /cannot be run via agent/i,
    );
  });
});
