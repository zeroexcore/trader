import { describe, it, expect, vi, beforeEach } from 'vitest';
import Big from 'big.js';

// ---------------------------------------------------------------------------
// Mock config so requireJupiterKey never throws, and we have stable token/api values
// ---------------------------------------------------------------------------
vi.mock('../../config.js', () => ({
  apis: { jupiterPrediction: 'https://api.jup.ag/prediction/v1' },
  tokens: { USDC: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v' },
  requireJupiterKey: () => 'test-jupiter-key',
}));

// Mock the solana util so executeOrder doesn't need a real connection
vi.mock('../../utils/solana.js', () => ({
  sendAndConfirmTransaction: vi.fn().mockResolvedValue('mock-sig-abc'),
}));

// ---------------------------------------------------------------------------
// Global fetch mock
// ---------------------------------------------------------------------------
const fetchMock = vi.fn();
vi.stubGlobal('fetch', fetchMock);

function jsonResponse(body: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(body),
    text: () => Promise.resolve(JSON.stringify(body)),
  };
}

// Import after mocks are wired up
const prediction = await import('../../utils/prediction.js');

beforeEach(() => {
  fetchMock.mockReset();
});

// ============================================================================
// microToUsd
// ============================================================================
describe('microToUsd', () => {
  it('converts 500_000 micro USD to Big(0.50)', () => {
    const result = prediction.microToUsd(500_000);
    expect(result.toFixed(2)).toBe('0.50');
  });

  it('converts 1_000_000 to Big(1.00)', () => {
    expect(prediction.microToUsd(1_000_000).toFixed(2)).toBe('1.00');
  });

  it('converts string "250000" to Big(0.25)', () => {
    expect(prediction.microToUsd('250000').toFixed(2)).toBe('0.25');
  });

  it('handles null gracefully', () => {
    expect(prediction.microToUsd(null).toNumber()).toBe(0);
  });

  it('handles undefined gracefully', () => {
    expect(prediction.microToUsd(undefined).toNumber()).toBe(0);
  });

  it('handles empty string gracefully', () => {
    expect(prediction.microToUsd('').toNumber()).toBe(0);
  });

  it('handles zero', () => {
    expect(prediction.microToUsd(0).toNumber()).toBe(0);
  });
});

// ============================================================================
// listEvents
// ============================================================================
describe('listEvents', () => {
  it('calls prediction API and returns events', async () => {
    const mockEvents = [
      { eventId: 'evt-1', metadata: { title: 'BTC to 100k?' }, markets: [] },
    ];
    fetchMock.mockResolvedValueOnce(jsonResponse({ data: mockEvents, total: 1 }));

    const result = await prediction.listEvents();

    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, opts] = fetchMock.mock.calls[0];
    expect(url).toBe('https://api.jup.ag/prediction/v1/events');
    expect(opts.headers['x-api-key']).toBe('test-jupiter-key');
    expect(result.events).toHaveLength(1);
    expect(result.events[0].eventId).toBe('evt-1');
    expect(result.total).toBe(1);
  });

  it('forwards category and limit query params', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ data: [], total: 0 }));

    await prediction.listEvents({ category: 'crypto', limit: 5 });

    const [url] = fetchMock.mock.calls[0];
    expect(url).toContain('category=crypto');
    expect(url).toContain('limit=5');
  });

  it('returns empty array when data is undefined', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({}));

    const result = await prediction.listEvents();
    expect(result.events).toEqual([]);
    expect(result.total).toBe(0);
  });
});

// ============================================================================
// searchEvents
// ============================================================================
describe('searchEvents', () => {
  it('URL-encodes the search query', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ data: [] }));

    await prediction.searchEvents('BTC to 100k?');

    const [url] = fetchMock.mock.calls[0];
    expect(url).toContain('query=BTC%20to%20100k%3F');
  });

  it('returns matching events', async () => {
    const mockEvents = [{ eventId: 'e1', metadata: { title: 'ETH merge' }, markets: [] }];
    fetchMock.mockResolvedValueOnce(jsonResponse({ data: mockEvents }));

    const result = await prediction.searchEvents('ETH');
    expect(result.events).toHaveLength(1);
    expect(result.events[0].eventId).toBe('e1');
  });
});

// ============================================================================
// getMarket
// ============================================================================
describe('getMarket', () => {
  it('fetches market by ID', async () => {
    const mockMarket = {
      marketId: 'MKT-123',
      status: 'open',
      result: null,
      metadata: { title: 'Will BTC hit 100k?' },
      pricing: {
        buyYesPriceUsd: 600_000,
        sellYesPriceUsd: 580_000,
        buyNoPriceUsd: 400_000,
        sellNoPriceUsd: 380_000,
      },
    };
    fetchMock.mockResolvedValueOnce(jsonResponse(mockMarket));

    const result = await prediction.getMarket('MKT-123');

    const [url] = fetchMock.mock.calls[0];
    expect(url).toBe('https://api.jup.ag/prediction/v1/markets/MKT-123');
    expect(result.marketId).toBe('MKT-123');
    expect(result.pricing.buyYesPriceUsd).toBe(600_000);
  });
});

// ============================================================================
// getPositions
// ============================================================================
describe('getPositions', () => {
  it('fetches user positions with ownerPubkey', async () => {
    const mockPositions = [
      { pubkey: 'pos-1', marketId: 'MKT-1', isYes: true, contracts: '10' },
    ];
    fetchMock.mockResolvedValueOnce(jsonResponse({ data: mockPositions }));

    const result = await prediction.getPositions('OWNER-PUB-KEY');

    const [url] = fetchMock.mock.calls[0];
    expect(url).toContain('ownerPubkey=OWNER-PUB-KEY');
    expect(result.positions).toHaveLength(1);
    expect(result.positions[0].pubkey).toBe('pos-1');
  });

  it('passes status filter', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ data: [] }));

    await prediction.getPositions('OWNER', { status: 'claimable' });

    const [url] = fetchMock.mock.calls[0];
    expect(url).toContain('status=claimable');
  });
});

// ============================================================================
// createOrder (buy)
// ============================================================================
describe('createOrder', () => {
  it('sends buy order with correct params', async () => {
    const mockResp = {
      transaction: 'dHhiYXNlNjQ=',
      txMeta: { blockhash: 'abc', lastValidBlockHeight: 100 },
      externalOrderId: 'ext-1',
      order: {
        orderPubkey: 'order-pub-1',
        marketId: 'MKT-1',
        isBuy: true,
        isYes: true,
        contracts: '50',
        maxBuyPriceUsd: null,
        orderCostUsd: '5000000',
        newAvgPriceUsd: '100000',
        estimatedTotalFeeUsd: '50000',
      },
    };
    fetchMock.mockResolvedValueOnce(jsonResponse(mockResp));

    const result = await prediction.createOrder({
      ownerPubkey: 'OWNER',
      marketId: 'MKT-1',
      isYes: true,
      amountUsd: 5, // $5
    });

    const [url, opts] = fetchMock.mock.calls[0];
    expect(url).toBe('https://api.jup.ag/prediction/v1/orders');
    expect(opts.method).toBe('POST');

    const body = JSON.parse(opts.body);
    expect(body.ownerPubkey).toBe('OWNER');
    expect(body.marketId).toBe('MKT-1');
    expect(body.isYes).toBe(true);
    expect(body.isBuy).toBe(true);
    // $5 -> 5_000_000 micro USD
    expect(body.depositAmount).toBe('5000000');
    expect(body.depositMint).toBe('EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v');
    expect(result.order.contracts).toBe('50');
  });

  it('converts fractional USD to micro USD', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({
      transaction: '', txMeta: {}, externalOrderId: '', order: {},
    }));

    await prediction.createOrder({
      ownerPubkey: 'O',
      marketId: 'M',
      isYes: false,
      amountUsd: 0.50,
    });

    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.depositAmount).toBe('500000');
  });
});

// ============================================================================
// createSellOrder
// ============================================================================
describe('createSellOrder', () => {
  it('sends sell order with correct params', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ transaction: 'dHg=', txMeta: {} }));

    await prediction.createSellOrder({
      ownerPubkey: 'OWNER',
      marketId: 'MKT-2',
      isYes: false,
      contracts: 25,
    });

    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.isBuy).toBe(false);
    expect(body.isYes).toBe(false);
    expect(body.contracts).toBe(25);
    expect(body.minSellPriceUsd).toBeUndefined();
  });

  it('converts minSellPriceUsd to micro USD', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ transaction: '', txMeta: {} }));

    await prediction.createSellOrder({
      ownerPubkey: 'O',
      marketId: 'M',
      isYes: true,
      contracts: 10,
      minSellPriceUsd: 0.15, // 15 cents
    });

    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.minSellPriceUsd).toBe('150000');
  });
});

// ============================================================================
// closePredictionOrder
// ============================================================================
describe('closePredictionOrder', () => {
  it('sends DELETE to position endpoint', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ transaction: 'dHg=', txMeta: {} }));

    await prediction.closePredictionOrder({
      ownerPubkey: 'OWNER',
      positionPubkey: 'POS-PUB-1',
    });

    const [url, opts] = fetchMock.mock.calls[0];
    expect(url).toBe('https://api.jup.ag/prediction/v1/positions/POS-PUB-1');
    expect(opts.method).toBe('DELETE');
    const body = JSON.parse(opts.body);
    expect(body.ownerPubkey).toBe('OWNER');
  });
});

// ============================================================================
// createClaimOrder
// ============================================================================
describe('createClaimOrder', () => {
  it('sends POST to claim endpoint', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ transaction: 'dHg=', txMeta: {} }));

    await prediction.createClaimOrder({
      ownerPubkey: 'OWNER',
      positionPubkey: 'POS-PUB-2',
    });

    const [url, opts] = fetchMock.mock.calls[0];
    expect(url).toBe('https://api.jup.ag/prediction/v1/positions/POS-PUB-2/claim');
    expect(opts.method).toBe('POST');
    const body = JSON.parse(opts.body);
    expect(body.ownerPubkey).toBe('OWNER');
  });
});

// ============================================================================
// executeOrder
// ============================================================================
describe('executeOrder', () => {
  it('deserializes base64 transaction, signs, and sends', async () => {
    const { Keypair, VersionedTransaction } = await import('@solana/web3.js');
    const solana = await import('../../utils/solana.js');

    const payer = Keypair.generate();

    const mockDeserialize = vi.spyOn(VersionedTransaction, 'deserialize').mockReturnValueOnce({
      sign: vi.fn(),
    } as any);

    // Ensure the mock returns the expected value for this call
    vi.mocked(solana.sendAndConfirmTransaction).mockResolvedValueOnce('mock-sig-execute');

    const fakeConnection = {} as any;
    const txBase64 = Buffer.from('fake-tx-bytes').toString('base64');

    const sig = await prediction.executeOrder(fakeConnection, payer, {
      transaction: txBase64,
    });

    expect(mockDeserialize).toHaveBeenCalledWith(Buffer.from(txBase64, 'base64'));
    expect(solana.sendAndConfirmTransaction).toHaveBeenCalled();
    expect(sig).toBe('mock-sig-execute');
  });
});

// ============================================================================
// API error handling
// ============================================================================
describe('predictionFetch error handling', () => {
  it('throws on non-ok response', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 403,
      text: () => Promise.resolve('Forbidden'),
    });

    await expect(prediction.listEvents()).rejects.toThrow('Prediction API error (403): Forbidden');
  });
});

// ============================================================================
// buy.ts NaN validation
// ============================================================================
describe('buy command NaN validation', () => {
  vi.mock('../../utils/wallet.js', () => ({
    loadKeypairForSigning: vi.fn().mockReturnValue({
      publicKey: { toBase58: () => 'MOCK-PUBKEY' },
    }),
    getWalletAddress: vi.fn().mockReturnValue('MOCK-PUBKEY'),
  }));

  vi.mock('../shared.js', () => ({
    requirePassword: () => 'test-pw',
    getRpcUrl: () => 'https://fake-rpc.test',
    output: vi.fn(),
    action: (fn: any) => fn,
  }));

  // The buy/sell commands register their action with Commander via .action().
  // Commander's _actionHandler expects a single array of args.
  // We access the raw listener that Commander stores on the 'action' event.

  it('buy throws on non-numeric amount', async () => {
    const { buyCommand } = await import('./buy.js');

    const exitSpy = vi.spyOn(process, 'exit').mockImplementation((() => {
      throw new Error('process.exit called');
    }) as any);

    // Commander stores action listeners; invoke parseAsync which calls the action
    // with the right signature. We need to suppress commander's own exit.
    buyCommand.exitOverride();
    buyCommand.configureOutput({ writeErr: () => {}, writeOut: () => {} });

    await expect(
      buyCommand.parseAsync(['MKT-1', 'yes', 'not-a-number'], { from: 'user' })
    ).rejects.toThrow();

    exitSpy.mockRestore();
  });
});

// ============================================================================
// sell.ts NaN validation
// ============================================================================
describe('sell command NaN validation', () => {
  it('sell throws on non-numeric contracts', async () => {
    const { sellCommand } = await import('./sell.js');

    const exitSpy = vi.spyOn(process, 'exit').mockImplementation((() => {
      throw new Error('process.exit called');
    }) as any);

    sellCommand.exitOverride();
    sellCommand.configureOutput({ writeErr: () => {}, writeOut: () => {} });

    await expect(
      sellCommand.parseAsync(['MKT-1', 'yes', 'abc'], { from: 'user' })
    ).rejects.toThrow();

    exitSpy.mockRestore();
  });
});
