import { BN } from '@coral-xyz/anchor';
import { PublicKey } from '@solana/web3.js';
import Big from 'big.js';
import { getPoolStats, getAllCustodyInfo, getOpenPositions } from '../../utils/perps/index.js';

// ── Mock Anchor + Solana ────────────────────────────────────────────────────

// Store mocks so tests can configure per-test behavior
const mockPoolFetch = vi.fn();
const mockCustodyFetch = vi.fn();
const mockGetProgramAccounts = vi.fn();
const mockAccountsDecode = vi.fn();
const mockAccountsMemcmp = vi.fn(() => ({ memcmp: { offset: 0, bytes: 'pos' } }));

vi.mock('@coral-xyz/anchor', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@coral-xyz/anchor')>();

  const AnchorProvider = vi.fn().mockImplementation(function () { return {}; }) as any;
  AnchorProvider.defaultOptions = () => ({});

  const Wallet = vi.fn().mockImplementation(function () { return {}; });

  const Program = vi.fn().mockImplementation(function () {
    return {
      programId: { toBase58: () => 'PERPHjGBqRHArX4DySjwM6UJHiR3sWAatqfdBS2qQJu' },
      account: {
        pool: { fetch: mockPoolFetch },
        custody: { fetch: mockCustodyFetch },
      },
      coder: {
        accounts: {
          decode: mockAccountsDecode,
          memcmp: mockAccountsMemcmp,
        },
      },
    };
  });

  return { ...actual, AnchorProvider, Wallet, Program };
});

vi.mock('../../config.js', () => ({
  perps: {
    programId: 'PERPHjGBqRHArX4DySjwM6UJHiR3sWAatqfdBS2qQJu',
    poolAccount: '5BUwFW4nRbftYTDMbgxykoFWqWHPzahFSNAaaaJtVKsq',
    custody: {
      SOL: '7xS2gz2bTp3fwCC7knJvUWTEU9Tycczu6VhJYKgi1wdz',
      ETH: 'AQCGyheWPLeo6Qp9WpYS9m3Qj479t7R636N9ey1rEjEn',
      BTC: '5Pv3gM9JrFFH883SWAhvJC9RPYmo8UNxuFtv5bMMALkm',
      USDC: 'G18jKKXQwBbrHeiK3C9MRXhkHsLHf7XgCSisykV46EZa',
      USDT: '4vkNeXiYEUizLdrpdPS1eC2mccyM4NUPRtERrk6ZETkk',
    },
  },
}));

// Create a mock Connection that also has getProgramAccounts
function mockConnection() {
  return {
    getBlockHeight: vi.fn(async () => 300_000_000),
    getProgramAccounts: mockGetProgramAccounts,
  } as any;
}

beforeEach(() => {
  vi.clearAllMocks();
});

// ── Tests ───────────────────────────────────────────────────────────────────

describe('getPoolStats()', () => {
  it('fetches JLP pool data and returns parsed stats', async () => {
    mockPoolFetch.mockResolvedValue({
      aumUsd: new BN('2500000000000'), // 2,500,000 USDC (6 decimals)
      name: Array.from(Buffer.from('JLP Pool\0\0\0\0')),
    });

    const stats = await getPoolStats(mockConnection());

    expect(mockPoolFetch).toHaveBeenCalled();
    expect(stats.aumUsd.toNumber()).toBeCloseTo(2_500_000, 0);
    expect(stats.name).toBe('JLP Pool');
  });

  it('propagates RPC errors', async () => {
    mockPoolFetch.mockRejectedValue(new Error('RPC timeout'));

    await expect(getPoolStats(mockConnection())).rejects.toThrow('RPC timeout');
  });
});

describe('getAllCustodyInfo()', () => {
  it('fetches custody data for SOL, ETH, BTC markets', async () => {
    mockCustodyFetch.mockResolvedValue({
      pricing: { maxLeverage: new BN(1_000_000) }, // 100x (÷10000)
      increasePositionBps: new BN(6),
      decreasePositionBps: new BN(6),
    });

    const custodies = await getAllCustodyInfo(mockConnection());

    expect(custodies).toHaveLength(3);
    expect(custodies.map(c => c.name)).toEqual(['SOL', 'ETH', 'BTC']);

    for (const c of custodies) {
      expect(c.maxLeverage).toBe(100);
      expect(c.openFeeBps).toBe(6);
      expect(c.closeFeeBps).toBe(6);
    }
  });

  it('fetches each market custody account', async () => {
    mockCustodyFetch.mockResolvedValue({
      pricing: { maxLeverage: new BN(500_000) }, // 50x
      increasePositionBps: new BN(10),
      decreasePositionBps: new BN(8),
    });

    await getAllCustodyInfo(mockConnection());

    // Should have been called 3 times (SOL, ETH, BTC)
    expect(mockCustodyFetch).toHaveBeenCalledTimes(3);
  });
});

describe('getOpenPositions()', () => {
  const walletKey = new PublicKey('11111111111111111111111111111111');
  const custodySolKey = '7xS2gz2bTp3fwCC7knJvUWTEU9Tycczu6VhJYKgi1wdz';

  it('fetches and decodes user open perp positions', async () => {
    const positionData = {
      owner: { toBase58: () => walletKey.toBase58() },
      side: { long: {} },
      custody: { toBase58: () => custodySolKey },
      sizeUsd: new BN('50000000000'), // 50,000 USD (6 decimals)
      collateralUsd: new BN('5000000000'), // 5,000 USD
      price: new BN('150000000'), // 150 USD entry
    };

    mockGetProgramAccounts.mockResolvedValue([
      {
        pubkey: { toBase58: () => 'POSITION_PK_111' },
        account: { data: Buffer.alloc(512) },
      },
    ]);

    mockAccountsDecode.mockReturnValue(positionData);

    const positions = await getOpenPositions(mockConnection(), walletKey);

    expect(positions).toHaveLength(1);
    expect(positions[0].side).toBe('long');
    expect(positions[0].custody).toBe('SOL');
    expect(positions[0].sizeUsd.toNumber()).toBeCloseTo(50_000, 0);
    expect(positions[0].collateralUsd.toNumber()).toBeCloseTo(5_000, 0);
    expect(positions[0].leverage).toBeCloseTo(10, 0);
    expect(positions[0].publicKey).toBe('POSITION_PK_111');
  });

  it('filters out closed positions (sizeUsd = 0)', async () => {
    const closedPosition = {
      owner: { toBase58: () => walletKey.toBase58() },
      side: { long: {} },
      custody: { toBase58: () => custodySolKey },
      sizeUsd: new BN('0'),
      collateralUsd: new BN('0'),
      price: new BN('100000000'),
    };

    mockGetProgramAccounts.mockResolvedValue([
      { pubkey: { toBase58: () => 'CLOSED_POS' }, account: { data: Buffer.alloc(512) } },
    ]);
    mockAccountsDecode.mockReturnValue(closedPosition);

    const positions = await getOpenPositions(mockConnection(), walletKey);

    expect(positions).toHaveLength(0);
  });

  it('accepts wallet address as string', async () => {
    mockGetProgramAccounts.mockResolvedValue([]);

    const positions = await getOpenPositions(
      mockConnection(),
      '11111111111111111111111111111111'
    );

    expect(positions).toHaveLength(0);
    expect(mockGetProgramAccounts).toHaveBeenCalled();
  });

  it('identifies short positions', async () => {
    const shortPos = {
      owner: { toBase58: () => walletKey.toBase58() },
      side: { short: {} }, // no `long` key
      custody: { toBase58: () => custodySolKey },
      sizeUsd: new BN('10000000000'),
      collateralUsd: new BN('2000000000'),
      price: new BN('140000000'),
    };

    mockGetProgramAccounts.mockResolvedValue([
      { pubkey: { toBase58: () => 'SHORT_POS' }, account: { data: Buffer.alloc(512) } },
    ]);
    mockAccountsDecode.mockReturnValue(shortPos);

    const positions = await getOpenPositions(mockConnection(), walletKey);

    expect(positions[0].side).toBe('short');
  });
});
