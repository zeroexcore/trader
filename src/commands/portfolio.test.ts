import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Mocks — set up before importing the module under test
// ---------------------------------------------------------------------------

// Track what output() receives
let lastOutput: { data: any; mdFormatter?: () => string } | null = null;

vi.mock('./shared.js', () => ({
  requirePassword: () => 'test-pw',
  getRpcUrl: () => 'https://fake-rpc.test',
  output: (data: any, mdFormatter?: () => string) => {
    lastOutput = { data, mdFormatter };
  },
  action: (fn: any) => fn, // unwrap the try/catch wrapper so errors propagate
}));

vi.mock('../utils/wallet.js', () => ({
  getWalletAddress: () => 'MOCK-WALLET-ADDR',
}));

const getPortfolioMock = vi.fn();
vi.mock('../utils/helius.js', () => ({
  getPortfolio: (...args: any[]) => getPortfolioMock(...args),
}));

const getPositionStatsMock = vi.fn();
vi.mock('../utils/positions.js', () => ({
  getPositionStats: (...args: any[]) => getPositionStatsMock(...args),
}));

const getPositionsMock = vi.fn();

vi.mock('../utils/prediction.js', async (importOriginal) => {
  const { default: Big } = await import('big.js');
  return {
    getPositions: (...args: any[]) => getPositionsMock(...args),
    microToUsd: (v: any) => {
      if (v === null || v === undefined || v === '') return new Big(0);
      return new Big(v).div(1_000_000);
    },
  };
});

// Import the command after mocks
const { portfolioCommand } = await import('./portfolio.js');

async function runPortfolio() {
  // parseAsync with no args triggers the action
  await portfolioCommand.parseAsync([], { from: 'user' });
}

beforeEach(() => {
  lastOutput = null;
  getPortfolioMock.mockReset();
  getPositionsMock.mockReset();
  getPositionStatsMock.mockReset();
});

// ============================================================================
// Portfolio aggregation
// ============================================================================
describe('portfolio command', () => {
  it('aggregates on-chain holdings + prediction positions + PnL stats', async () => {
    getPortfolioMock.mockResolvedValue({
      totalValueUsd: 500,
      tokens: [
        { symbol: 'SOL', balance: 3, valueUsd: 450, mint: 'SOL', decimals: 9, pricePerToken: 150, name: 'Solana' },
        { symbol: 'USDC', balance: 50, valueUsd: 50, mint: 'USDC', decimals: 6, pricePerToken: 1, name: 'USD Coin' },
      ],
    });

    getPositionsMock.mockResolvedValue({
      positions: [
        {
          isYes: true,
          marketId: 'MKT-1',
          contracts: '50',
          totalCostUsd: '30000000',  // $30
          valueUsd: '40000000',      // $40
          pnlUsdAfterFees: '9500000', // $9.50
          pnlUsdAfterFeesPercent: 31.7,
          marketMetadata: { title: 'BTC 100k?', status: 'open', result: null },
          eventMetadata: { title: 'BTC Event', category: 'crypto' },
          claimable: false,
        },
      ],
    });

    getPositionStatsMock.mockReturnValue({
      totalPositions: 5,
      openPositions: 1,
      closedPositions: 4,
      totalInvested: 30,
      currentOpenValue: 40,
      realizedPnl: 15,
      unrealizedPnl: 10,
      winCount: 3,
      lossCount: 1,
      winRate: 75,
      avgWin: 10,
      avgLoss: -5,
      avgHoldTime: 24,
      bestTrade: null,
      worstTrade: null,
      byType: { long: { count: 0, pnl: 0 }, short: { count: 0, pnl: 0 }, prediction: { count: 4, pnl: 15 } },
    });

    await runPortfolio();

    expect(lastOutput).not.toBeNull();
    const d = lastOutput!.data;

    // Address — getWalletAddress receives result of requirePassword()
    expect(d.address).toBe('MOCK-WALLET-ADDR');

    // On-chain holdings
    expect(d.onChain.totalUsd).toBe(500);
    expect(d.onChain.holdings).toHaveLength(2);

    // Predictions
    expect(d.predictions.count).toBe(1);
    expect(d.predictions.costUsd).toBe(30);
    expect(d.predictions.valueUsd).toBe(40);
    expect(d.predictions.pnlUsd).toBeCloseTo(9.5, 1);

    // PnL summary
    expect(d.pnl.realized).toBe(15);
    expect(d.pnl.unrealized).toBeCloseTo(9.5, 1);
    expect(d.pnl.total).toBeCloseTo(24.5, 1);
    expect(d.pnl.winRate).toBe(75);
    expect(d.pnl.winCount).toBe(3);
    expect(d.pnl.lossCount).toBe(1);
  });

  it('handles prediction API failure gracefully — shows what we have', async () => {
    getPortfolioMock.mockResolvedValue({
      totalValueUsd: 100,
      tokens: [
        { symbol: 'SOL', balance: 0.5, valueUsd: 75, mint: 'SOL', decimals: 9, pricePerToken: 150, name: 'Solana' },
      ],
    });

    // Prediction API throws
    getPositionsMock.mockRejectedValue(new Error('API down'));

    getPositionStatsMock.mockReturnValue({
      totalPositions: 0,
      openPositions: 0,
      closedPositions: 0,
      totalInvested: 0,
      currentOpenValue: 0,
      realizedPnl: 0,
      unrealizedPnl: 0,
      winCount: 0,
      lossCount: 0,
      winRate: 0,
      avgWin: 0,
      avgLoss: 0,
      avgHoldTime: 0,
      bestTrade: null,
      worstTrade: null,
      byType: { long: { count: 0, pnl: 0 }, short: { count: 0, pnl: 0 }, prediction: { count: 0, pnl: 0 } },
    });

    await runPortfolio();

    expect(lastOutput).not.toBeNull();
    const d = lastOutput!.data;

    // On-chain still shows
    expect(d.onChain.totalUsd).toBe(100);
    expect(d.onChain.holdings).toHaveLength(1);

    // Predictions are empty but no crash
    expect(d.predictions.count).toBe(0);
    expect(d.predictions.costUsd).toBe(0);
    expect(d.predictions.valueUsd).toBe(0);
  });

  it('markdown output includes address, onChain, predictions, and pnl sections', async () => {
    getPortfolioMock.mockResolvedValue({
      totalValueUsd: 200,
      tokens: [
        { symbol: 'USDC', balance: 200, valueUsd: 200, mint: 'USDC', decimals: 6, pricePerToken: 1, name: 'USD Coin' },
      ],
    });

    getPositionsMock.mockResolvedValue({
      positions: [
        {
          isYes: true,
          marketId: 'MKT-X',
          contracts: '10',
          totalCostUsd: '5000000',
          valueUsd: '7000000',
          pnlUsdAfterFees: '1800000',
          pnlUsdAfterFeesPercent: 36,
          marketMetadata: { title: 'ETH Merge?', status: 'open', result: null },
          eventMetadata: { title: 'ETH Event', category: 'crypto' },
          claimable: false,
        },
      ],
    });

    getPositionStatsMock.mockReturnValue({
      totalPositions: 2,
      openPositions: 1,
      closedPositions: 1,
      totalInvested: 5,
      currentOpenValue: 7,
      realizedPnl: 3,
      unrealizedPnl: 2,
      winCount: 1,
      lossCount: 0,
      winRate: 100,
      avgWin: 3,
      avgLoss: 0,
      avgHoldTime: 12,
      bestTrade: { symbol: 'YES ETH', pnl: 3, pnlPercent: 60 },
      worstTrade: null,
      byType: { long: { count: 0, pnl: 0 }, short: { count: 0, pnl: 0 }, prediction: { count: 1, pnl: 3 } },
    });

    await runPortfolio();

    expect(lastOutput).not.toBeNull();
    expect(lastOutput!.mdFormatter).toBeDefined();

    const md = lastOutput!.mdFormatter!();

    // Address section
    expect(md).toContain('MOCK-WAL'); // truncated address

    // Token holdings
    expect(md).toContain('Token Holdings');
    expect(md).toContain('USDC');

    // Prediction bets
    expect(md).toContain('Prediction Bets');
    expect(md).toContain('YES');

    // PnL
    expect(md).toContain('PnL Summary');
    expect(md).toContain('Realized');
    expect(md).toContain('Win Rate');
  });

  it('filters out holdings below $0.01', async () => {
    getPortfolioMock.mockResolvedValue({
      totalValueUsd: 100,
      tokens: [
        { symbol: 'SOL', balance: 1, valueUsd: 100, mint: 'SOL', decimals: 9, pricePerToken: 100, name: 'Solana' },
        { symbol: 'DUST', balance: 0.001, valueUsd: 0.001, mint: 'DUST', decimals: 9, pricePerToken: 1, name: 'Dust' },
      ],
    });

    getPositionsMock.mockResolvedValue({ positions: [] });
    getPositionStatsMock.mockReturnValue({
      totalPositions: 0, openPositions: 0, closedPositions: 0,
      totalInvested: 0, currentOpenValue: 0, realizedPnl: 0, unrealizedPnl: 0,
      winCount: 0, lossCount: 0, winRate: 0, avgWin: 0, avgLoss: 0, avgHoldTime: 0,
      bestTrade: null, worstTrade: null,
      byType: { long: { count: 0, pnl: 0 }, short: { count: 0, pnl: 0 }, prediction: { count: 0, pnl: 0 } },
    });

    await runPortfolio();

    const d = lastOutput!.data;
    // DUST filtered out (valueUsd < 0.01)
    expect(d.onChain.holdings).toHaveLength(1);
    expect(d.onChain.holdings[0].symbol).toBe('SOL');
  });
});
