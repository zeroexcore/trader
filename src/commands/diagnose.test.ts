import { diagnoseCommand } from './diagnose.js';

// Mock modules before any imports that use them
vi.mock('fs', () => ({
  default: { existsSync: vi.fn() },
  existsSync: vi.fn(),
}));

vi.mock('../config.js', () => ({
  env: {
    walletPassword: vi.fn(),
    heliusApiKey: vi.fn(),
    jupiterApiKey: vi.fn(),
    useHeliusSender: vi.fn(() => false),
    home: vi.fn(() => '/home/test'),
  },
  paths: {
    walletFile: vi.fn(() => '/home/test/.openclaw/trader-wallet.enc'),
  },
  apis: {
    jupiterPrediction: 'https://api.jup.ag/prediction/v1',
    heliusRpc: (key: string) => `https://mainnet.helius-rpc.com/?api-key=${key}`,
    solanaMainnet: 'https://api.mainnet-beta.solana.com',
  },
  getRpcUrl: vi.fn(() => 'https://mainnet.helius-rpc.com/?api-key=test-key'),
  requirePassword: vi.fn(() => 'test-password'),
  requireHeliusKey: vi.fn(() => 'helius-key'),
  requireJupiterKey: vi.fn(() => 'jupiter-key'),
}));

vi.mock('../utils/wallet.js', () => ({
  getWalletAddress: vi.fn(() => 'WALLETxADDRESS1111111111111111111111111111111'),
}));

vi.mock('@solana/web3.js', () => {
  const PublicKey = vi.fn(function (this: any, key: string) { this.toBase58 = () => key; });
  const Connection = vi.fn(function (this: any) {
    this.getBlockHeight = vi.fn(async () => 300_000_000);
    this.getBalance = vi.fn(async () => 1_500_000_000); // 1.5 SOL
  });
  return { Connection, PublicKey };
});

import fs from 'fs';
import { env, paths } from '../config.js';

// Capture console.log output
function captureOutput(): { get(): string; restore(): void } {
  const original = console.log;
  let captured = '';
  console.log = (...args: any[]) => { captured += args.join(' '); };
  return {
    get: () => captured,
    restore: () => { console.log = original; },
  };
}

describe('diagnoseCommand', () => {
  const envMock = env as {
    walletPassword: ReturnType<typeof vi.fn>;
    heliusApiKey: ReturnType<typeof vi.fn>;
    jupiterApiKey: ReturnType<typeof vi.fn>;
    useHeliusSender: ReturnType<typeof vi.fn>;
  };
  const fsMock = fs as unknown as { existsSync: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    // Defaults: everything is set / happy path
    envMock.walletPassword.mockReturnValue('test-password');
    envMock.heliusApiKey.mockReturnValue('helius-key');
    envMock.jupiterApiKey.mockReturnValue('jupiter-key');
    envMock.useHeliusSender.mockReturnValue(false);
    fsMock.existsSync.mockReturnValue(true);

    // Mock global fetch — Jupiter API returns 200
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({}),
    })));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('reports all checks passing when env vars set and APIs respond OK', async () => {
    const out = captureOutput();
    try {
      await diagnoseCommand.parseAsync(['diagnose'], { from: 'user' });
      const result = JSON.parse(out.get());

      expect(result.summary.failures).toBe(0);
      expect(result.summary.warnings).toBe(0);
      expect(result.checks.find((c: any) => c.name === 'WALLET_PASSWORD').status).toBe('ok');
      expect(result.checks.find((c: any) => c.name === 'HELIUS_API_KEY').status).toBe('ok');
      expect(result.checks.find((c: any) => c.name === 'JUPITER_API_KEY').status).toBe('ok');
      expect(result.checks.find((c: any) => c.name === 'Wallet file').status).toBe('ok');
      expect(result.checks.find((c: any) => c.name === 'Jupiter API').status).toBe('ok');
    } finally {
      out.restore();
    }
  });

  it('WALLET_PASSWORD check fails when not set', async () => {
    envMock.walletPassword.mockReturnValue(undefined);

    const out = captureOutput();
    try {
      await diagnoseCommand.parseAsync(['diagnose'], { from: 'user' });
      const result = JSON.parse(out.get());

      const check = result.checks.find((c: any) => c.name === 'WALLET_PASSWORD');
      expect(check.status).toBe('fail');
      expect(check.message).toMatch(/Not set/);
      expect(result.summary.failures).toBeGreaterThanOrEqual(1);
    } finally {
      out.restore();
    }
  });

  it('HELIUS_API_KEY check fails when not set', async () => {
    envMock.heliusApiKey.mockReturnValue(undefined);

    const out = captureOutput();
    try {
      await diagnoseCommand.parseAsync(['diagnose'], { from: 'user' });
      const result = JSON.parse(out.get());

      const check = result.checks.find((c: any) => c.name === 'HELIUS_API_KEY');
      expect(check.status).toBe('fail');
      expect(check.message).toMatch(/Not set/);
    } finally {
      out.restore();
    }
  });

  it('JUPITER_API_KEY shows warn (not fail) when not set', async () => {
    envMock.jupiterApiKey.mockReturnValue(undefined);

    const out = captureOutput();
    try {
      await diagnoseCommand.parseAsync(['diagnose'], { from: 'user' });
      const result = JSON.parse(out.get());

      const check = result.checks.find((c: any) => c.name === 'JUPITER_API_KEY');
      expect(check.status).toBe('warn');
      expect(check.status).not.toBe('fail');
    } finally {
      out.restore();
    }
  });

  it('Wallet file check fails when file does not exist', async () => {
    fsMock.existsSync.mockReturnValue(false);

    const out = captureOutput();
    try {
      await diagnoseCommand.parseAsync(['diagnose'], { from: 'user' });
      const result = JSON.parse(out.get());

      const check = result.checks.find((c: any) => c.name === 'Wallet file');
      expect(check.status).toBe('fail');
      expect(check.message).toMatch(/Not found/);
    } finally {
      out.restore();
    }
  });

  it('Jupiter API check handles geo-block (403 status)', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: false,
      status: 403,
      json: async () => ({}),
    })));

    const out = captureOutput();
    try {
      await diagnoseCommand.parseAsync(['diagnose'], { from: 'user' });
      const result = JSON.parse(out.get());

      const check = result.checks.find((c: any) => c.name === 'Jupiter API');
      expect(check.status).toBe('fail');
      expect(check.message).toMatch(/Geo-blocked/i);
    } finally {
      out.restore();
    }
  });
});
