import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Mock fs — we intercept all file I/O so nothing touches disk
// ---------------------------------------------------------------------------
const fsMock = {
  existsSync: vi.fn(),
  readFileSync: vi.fn(),
  writeFileSync: vi.fn(),
  mkdirSync: vi.fn(),
};
vi.mock('fs', () => ({ default: fsMock, ...fsMock }));

// Mock config paths to deterministic values
vi.mock('../config.js', () => ({
  paths: {
    openclawDir: () => '/home/test/.openclaw',
    positionsFile: () => '/home/test/.openclaw/trader-positions.json',
  },
}));

// Import after mocks
const {
  openPosition,
  openPredictionPosition,
  closePredictionPosition,
  findPredictionByMarket,
  findPredictionByPubkey,
  getPositionStats,
} = await import('./positions.js');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function emptyData() {
  return { positions: [], lastUpdated: new Date().toISOString() };
}

/** Capture what savePositions wrote to disk. */
function capturedWrite(): { data: any; options: any } | null {
  const calls = fsMock.writeFileSync.mock.calls;
  if (calls.length === 0) return null;
  const last = calls[calls.length - 1];
  return { data: JSON.parse(last[1] as string), options: last[2] };
}

beforeEach(() => {
  fsMock.existsSync.mockReset();
  fsMock.readFileSync.mockReset();
  fsMock.writeFileSync.mockReset();
  fsMock.mkdirSync.mockReset();

  // Default: secure dir exists, no positions file, no legacy file
  fsMock.existsSync.mockImplementation((p: string) => {
    if (p === '/home/test/.openclaw') return true;
    return false;
  });
});

// ============================================================================
// openPosition
// ============================================================================
describe('openPosition', () => {
  it('creates a position with correct fields and saves', () => {
    const pos = openPosition({
      type: 'long',
      token: 'SOL-MINT',
      tokenSymbol: 'SOL',
      entryPrice: 150,
      entryAmount: 2,
      notes: 'test trade',
      entryTxSignature: 'sig-abc',
    });

    expect(pos.id).toMatch(/^pos_/);
    expect(pos.type).toBe('long');
    expect(pos.token).toBe('SOL-MINT');
    expect(pos.tokenSymbol).toBe('SOL');
    expect(pos.entryPrice).toBe(150);
    expect(pos.entryAmount).toBe(2);
    expect(pos.entryValueUsd).toBe(300); // 150 * 2
    expect(pos.status).toBe('open');
    expect(pos.notes).toBe('test trade');
    expect(pos.entryTxSignature).toBe('sig-abc');
    expect(pos.entryDate).toBeDefined();

    // Verify it was saved
    const saved = capturedWrite();
    expect(saved).not.toBeNull();
    expect(saved!.data.positions).toHaveLength(1);
    expect(saved!.data.positions[0].id).toBe(pos.id);
  });

  it('writes file with 0o600 permissions', () => {
    openPosition({
      type: 'short',
      token: 'ETH-MINT',
      tokenSymbol: 'ETH',
      entryPrice: 3000,
      entryAmount: 1,
    });

    const saved = capturedWrite();
    expect(saved!.options.mode).toBe(0o600);
  });
});

// ============================================================================
// openPredictionPosition
// ============================================================================
describe('openPredictionPosition', () => {
  it('creates a prediction position with correct fields', () => {
    const pos = openPredictionPosition({
      marketId: 'MKT-1',
      eventTitle: 'BTC Event',
      marketTitle: 'BTC to 100k?',
      side: 'yes',
      contracts: 50,
      entryPrice: 0.60,
      costUsd: 30,
      payoutIfWin: 50,
      txSignature: 'sig-xyz',
      positionPubkey: 'pos-pub-1',
      notes: 'bullish',
    });

    expect(pos.id).toMatch(/^pred_/);
    expect(pos.type).toBe('prediction');
    expect(pos.token).toBe('MKT-1');
    expect(pos.tokenSymbol).toBe('YES BTC to 100k?');
    expect(pos.entryPrice).toBe(0.60);
    expect(pos.entryAmount).toBe(50);
    expect(pos.entryValueUsd).toBe(30);
    expect(pos.status).toBe('open');
    expect(pos.prediction).toEqual({
      marketId: 'MKT-1',
      eventTitle: 'BTC Event',
      marketTitle: 'BTC to 100k?',
      side: 'yes',
      contracts: 50,
      payoutIfWin: 50,
      positionPubkey: 'pos-pub-1',
      txSignature: 'sig-xyz',
    });
  });
});

// ============================================================================
// closePredictionPosition
// ============================================================================
describe('closePredictionPosition', () => {
  function setupWithOpenPrediction(overrides: Record<string, any> = {}) {
    const pos = {
      id: 'pred_123',
      type: 'prediction',
      token: 'MKT-1',
      tokenSymbol: 'YES BTC',
      entryPrice: 0.60,
      entryAmount: 50,
      entryValueUsd: 30,
      entryDate: '2025-01-01T00:00:00Z',
      status: 'open',
      prediction: {
        marketId: 'MKT-1',
        eventTitle: 'BTC Event',
        marketTitle: 'BTC to 100k?',
        side: 'yes',
        contracts: 50,
        payoutIfWin: 50,
        txSignature: 'sig-xyz',
      },
      ...overrides,
    };
    const data = { positions: [pos], lastUpdated: '2025-01-01T00:00:00Z' };

    fsMock.existsSync.mockImplementation((p: string) => {
      if (p === '/home/test/.openclaw') return true;
      if (p === '/home/test/.openclaw/trader-positions.json') return true;
      return false;
    });
    fsMock.readFileSync.mockReturnValue(JSON.stringify(data));
    return pos;
  }

  it('sets pnl correctly for won outcome', () => {
    setupWithOpenPrediction();

    const result = closePredictionPosition('pred_123', 'won', 50);

    expect(result).not.toBeNull();
    expect(result!.status).toBe('won');
    expect(result!.exitPrice).toBe(1); // settled at $1
    expect(result!.exitValueUsd).toBe(50);
    expect(result!.pnl).toBe(20); // 50 - 30
    expect(result!.pnlPercent).toBeCloseTo(66.67, 1); // (20/30)*100
    expect(result!.exitDate).toBeDefined();
  });

  it('uses payoutIfWin as default payout when payoutUsd not provided', () => {
    setupWithOpenPrediction();

    const result = closePredictionPosition('pred_123', 'won');

    expect(result!.exitValueUsd).toBe(50); // payoutIfWin
    expect(result!.pnl).toBe(20);
  });

  it('sets pnl to negative entry value for lost outcome', () => {
    setupWithOpenPrediction();

    const result = closePredictionPosition('pred_123', 'lost');

    expect(result!.status).toBe('lost');
    expect(result!.exitPrice).toBe(0);
    expect(result!.exitValueUsd).toBe(0);
    expect(result!.pnl).toBe(-30); // -entryValueUsd
    expect(result!.pnlPercent).toBe(-100);
  });

  it('returns null for non-existent position', () => {
    setupWithOpenPrediction();
    const result = closePredictionPosition('pred_nonexistent', 'won');
    expect(result).toBeNull();
  });

  it('returns null for non-prediction position', () => {
    fsMock.existsSync.mockImplementation((p: string) => {
      if (p === '/home/test/.openclaw') return true;
      if (p === '/home/test/.openclaw/trader-positions.json') return true;
      return false;
    });
    fsMock.readFileSync.mockReturnValue(JSON.stringify({
      positions: [{
        id: 'pos_123',
        type: 'long',
        token: 'SOL',
        tokenSymbol: 'SOL',
        entryPrice: 100,
        entryAmount: 1,
        entryValueUsd: 100,
        entryDate: '2025-01-01',
        status: 'open',
      }],
      lastUpdated: '',
    }));

    const result = closePredictionPosition('pos_123', 'won');
    expect(result).toBeNull();
  });

  it('writes with 0o600 permissions', () => {
    setupWithOpenPrediction();
    closePredictionPosition('pred_123', 'won', 50);

    const saved = capturedWrite();
    expect(saved!.options.mode).toBe(0o600);
  });
});

// ============================================================================
// findPredictionByMarket
// ============================================================================
describe('findPredictionByMarket', () => {
  function setupPositions() {
    const positions = [
      {
        id: 'pred_1',
        type: 'prediction',
        token: 'MKT-A',
        tokenSymbol: 'YES MKT-A',
        entryPrice: 0.5,
        entryAmount: 10,
        entryValueUsd: 5,
        entryDate: '2025-01-01',
        status: 'open',
        prediction: {
          marketId: 'MKT-A',
          eventTitle: 'E',
          marketTitle: 'M',
          side: 'yes',
          contracts: 10,
          payoutIfWin: 10,
          txSignature: 'sig',
        },
      },
      {
        id: 'pred_2',
        type: 'prediction',
        token: 'MKT-A',
        tokenSymbol: 'NO MKT-A',
        entryPrice: 0.5,
        entryAmount: 10,
        entryValueUsd: 5,
        entryDate: '2025-01-01',
        status: 'open',
        prediction: {
          marketId: 'MKT-A',
          eventTitle: 'E',
          marketTitle: 'M',
          side: 'no',
          contracts: 10,
          payoutIfWin: 10,
          txSignature: 'sig',
        },
      },
      {
        id: 'pred_3',
        type: 'prediction',
        token: 'MKT-B',
        tokenSymbol: 'YES MKT-B',
        entryPrice: 0.5,
        entryAmount: 10,
        entryValueUsd: 5,
        entryDate: '2025-01-01',
        status: 'closed',
        prediction: {
          marketId: 'MKT-B',
          eventTitle: 'E',
          marketTitle: 'M',
          side: 'yes',
          contracts: 10,
          payoutIfWin: 10,
          txSignature: 'sig',
        },
      },
    ];

    fsMock.existsSync.mockImplementation((p: string) => {
      if (p === '/home/test/.openclaw') return true;
      if (p === '/home/test/.openclaw/trader-positions.json') return true;
      return false;
    });
    fsMock.readFileSync.mockReturnValue(JSON.stringify({ positions, lastUpdated: '' }));
  }

  it('finds open positions by market ID', () => {
    setupPositions();
    const result = findPredictionByMarket('MKT-A');
    expect(result).not.toBeNull();
    expect(result!.id).toBe('pred_1');
  });

  it('filters by side', () => {
    setupPositions();
    const result = findPredictionByMarket('MKT-A', 'no');
    expect(result).not.toBeNull();
    expect(result!.id).toBe('pred_2');
  });

  it('does not find closed positions', () => {
    setupPositions();
    const result = findPredictionByMarket('MKT-B');
    expect(result).toBeNull();
  });

  it('returns null for unknown market', () => {
    setupPositions();
    expect(findPredictionByMarket('MKT-UNKNOWN')).toBeNull();
  });
});

// ============================================================================
// findPredictionByPubkey
// ============================================================================
describe('findPredictionByPubkey', () => {
  it('finds positions by pubkey', () => {
    fsMock.existsSync.mockImplementation((p: string) => {
      if (p === '/home/test/.openclaw') return true;
      if (p === '/home/test/.openclaw/trader-positions.json') return true;
      return false;
    });
    fsMock.readFileSync.mockReturnValue(JSON.stringify({
      positions: [{
        id: 'pred_1',
        type: 'prediction',
        token: 'MKT-A',
        tokenSymbol: 'YES',
        entryPrice: 0.5,
        entryAmount: 10,
        entryValueUsd: 5,
        entryDate: '2025-01-01',
        status: 'open',
        prediction: {
          marketId: 'MKT-A',
          eventTitle: 'E',
          marketTitle: 'M',
          side: 'yes',
          contracts: 10,
          payoutIfWin: 10,
          positionPubkey: 'POS-PUB-XYZ',
          txSignature: 'sig',
        },
      }],
      lastUpdated: '',
    }));

    const result = findPredictionByPubkey('POS-PUB-XYZ');
    expect(result).not.toBeNull();
    expect(result!.id).toBe('pred_1');
  });

  it('returns null for unknown pubkey', () => {
    fsMock.existsSync.mockImplementation((p: string) => {
      if (p === '/home/test/.openclaw') return true;
      return false;
    });
    expect(findPredictionByPubkey('UNKNOWN')).toBeNull();
  });
});

// ============================================================================
// getPositionStats
// ============================================================================
describe('getPositionStats', () => {
  it('calculates win rate, realized PnL, and counts correctly', () => {
    const positions = [
      // Won prediction: cost $30, pnl +$20
      {
        id: 'pred_1', type: 'prediction', token: 'M1', tokenSymbol: 'YES M1',
        entryPrice: 0.6, entryAmount: 50, entryValueUsd: 30,
        entryDate: '2025-01-01', status: 'won',
        pnl: 20, pnlPercent: 66.67,
        exitPrice: 1, exitAmount: 50, exitValueUsd: 50, exitDate: '2025-01-02',
        prediction: { marketId: 'M1', eventTitle: 'E', marketTitle: 'M', side: 'yes', contracts: 50, payoutIfWin: 50, txSignature: 's' },
      },
      // Lost prediction: cost $10, pnl -$10
      {
        id: 'pred_2', type: 'prediction', token: 'M2', tokenSymbol: 'NO M2',
        entryPrice: 0.5, entryAmount: 20, entryValueUsd: 10,
        entryDate: '2025-01-01', status: 'lost',
        pnl: -10, pnlPercent: -100,
        exitPrice: 0, exitAmount: 20, exitValueUsd: 0, exitDate: '2025-01-02',
        prediction: { marketId: 'M2', eventTitle: 'E', marketTitle: 'M', side: 'no', contracts: 20, payoutIfWin: 20, txSignature: 's' },
      },
      // Open long — not counted in closed stats
      {
        id: 'pos_3', type: 'long', token: 'SOL', tokenSymbol: 'SOL',
        entryPrice: 100, entryAmount: 1, entryValueUsd: 100,
        entryDate: '2025-01-01', status: 'open',
      },
    ];

    fsMock.existsSync.mockImplementation((p: string) => {
      if (p === '/home/test/.openclaw') return true;
      if (p === '/home/test/.openclaw/trader-positions.json') return true;
      return false;
    });
    fsMock.readFileSync.mockReturnValue(JSON.stringify({ positions, lastUpdated: '' }));

    const stats = getPositionStats();

    expect(stats.totalPositions).toBe(3);
    expect(stats.openPositions).toBe(1);
    expect(stats.closedPositions).toBe(2);
    expect(stats.winCount).toBe(1);
    expect(stats.lossCount).toBe(1);
    expect(stats.winRate).toBe(50); // 1 win / 2 closed
    expect(stats.realizedPnl).toBe(10); // 20 + (-10)
    expect(stats.avgWin).toBe(20);
    expect(stats.avgLoss).toBe(-10);
    expect(stats.totalInvested).toBe(100); // only the open position
    expect(stats.byType.prediction.count).toBe(2);
    expect(stats.byType.prediction.pnl).toBe(10);
    expect(stats.byType.long.count).toBe(0); // open, not closed
    expect(stats.bestTrade?.pnl).toBe(20);
    expect(stats.worstTrade?.pnl).toBe(-10);
  });

  it('returns zeros when no positions exist', () => {
    // No positions file
    fsMock.existsSync.mockImplementation((p: string) => {
      if (p === '/home/test/.openclaw') return true;
      return false;
    });

    const stats = getPositionStats();

    expect(stats.totalPositions).toBe(0);
    expect(stats.closedPositions).toBe(0);
    expect(stats.winRate).toBe(0);
    expect(stats.realizedPnl).toBe(0);
    expect(stats.bestTrade).toBeNull();
    expect(stats.worstTrade).toBeNull();
  });
});
