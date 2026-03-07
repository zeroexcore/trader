import Big from 'big.js';
import {
  getCollectionStats,
  getListings,
  getPopularCollections,
  searchCollections,
  getWalletNFTs,
  formatSol,
  solToUsd,
} from '../../utils/nft.js';

// All tests mock global fetch
const fetchMock = vi.fn();

beforeEach(() => {
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

// Helper to create a mock Response
function mockResponse(body: any, ok = true, status = 200) {
  return { ok, status, json: async () => body };
}

// ────────────────────────── getCollectionStats ──────────────────────────

describe('getCollectionStats()', () => {
  it('calls Magic Eden API with correct collection symbol', async () => {
    fetchMock.mockResolvedValue(mockResponse({
      symbol: 'degods',
      floorPrice: 50_000_000_000, // 50 SOL in lamports
      listedCount: 123,
      volumeAll: 1_000_000_000_000, // 1000 SOL
    }));

    const stats = await getCollectionStats('degods');

    expect(fetchMock).toHaveBeenCalledWith(
      'https://api-mainnet.magiceden.dev/v2/collections/degods/stats'
    );
    expect(stats.symbol).toBe('degods');
    expect(stats.floorPrice.toNumber()).toBeCloseTo(50);
    expect(stats.listedCount).toBe(123);
    expect(stats.volumeAll.toNumber()).toBeCloseTo(1000);
  });

  it('throws when collection is not found', async () => {
    fetchMock.mockResolvedValue(mockResponse({}, false, 404));

    await expect(getCollectionStats('nonexistent')).rejects.toThrow('Collection not found');
  });
});

// ────────────────────────── getListings ──────────────────────────

describe('getListings()', () => {
  it('fetches listings for a collection', async () => {
    fetchMock.mockResolvedValue(mockResponse([
      {
        tokenMint: 'MINT111',
        token: { name: 'DeGod #1', image: 'https://img.test/1.png', attributes: [{ trait_type: 'bg', value: 'blue' }] },
        price: 55,
        seller: 'SELLER111',
      },
      {
        tokenMint: 'MINT222',
        token: { name: 'DeGod #2', image: 'https://img.test/2.png' },
        price: 60,
        seller: 'SELLER222',
      },
    ]));

    const listings = await getListings('degods', 10);

    expect(fetchMock).toHaveBeenCalledWith(
      'https://api-mainnet.magiceden.dev/v2/collections/degods/listings?limit=10'
    );
    expect(listings).toHaveLength(2);
    expect(listings[0].mint).toBe('MINT111');
    expect(listings[0].name).toBe('DeGod #1');
    expect(listings[0].price.toNumber()).toBe(55);
    expect(listings[0].attributes).toEqual({ bg: 'blue' });
    expect(listings[1].attributes).toEqual({});
  });

  it('throws on API error', async () => {
    fetchMock.mockResolvedValue(mockResponse({}, false, 500));

    await expect(getListings('degods')).rejects.toThrow('Failed to fetch listings');
  });
});

// ────────────────────────── getPopularCollections ──────────────────────────

describe('getPopularCollections()', () => {
  it('fetches trending collections', async () => {
    fetchMock.mockResolvedValue(mockResponse([
      { symbol: 'abc', name: 'ABC', floorPrice: 2_000_000_000, listedCount: 50, volumeAll: 100_000_000_000 },
      { symbol: 'xyz', name: 'XYZ', floorPrice: 500_000_000, listedCount: 200, volumeAll: 50_000_000_000 },
    ]));

    const collections = await getPopularCollections(20);

    expect(fetchMock).toHaveBeenCalledWith(
      'https://api-mainnet.magiceden.dev/v2/marketplace/popular_collections?timeRange=1d&limit=20'
    );
    expect(collections).toHaveLength(2);
    expect(collections[0].symbol).toBe('abc');
    expect(collections[0].floorPrice.toNumber()).toBeCloseTo(2);
    expect(collections[1].floorPrice.toNumber()).toBeCloseTo(0.5);
  });

  it('throws on API error', async () => {
    fetchMock.mockResolvedValue(mockResponse({}, false, 500));

    await expect(getPopularCollections()).rejects.toThrow('Failed to fetch popular collections');
  });
});

// ────────────────────────── searchCollections ──────────────────────────

describe('searchCollections()', () => {
  it('URL-encodes search query', async () => {
    fetchMock.mockResolvedValue(mockResponse([
      { symbol: 'de_gods', name: 'DeGods', floorPrice: 0, listedCount: 0, volumeAll: 0 },
    ]));

    await searchCollections('de gods & stuff');

    expect(fetchMock).toHaveBeenCalledWith(
      'https://api-mainnet.magiceden.dev/v2/collections?name=de%20gods%20%26%20stuff&limit=20'
    );
  });

  it('returns parsed collection stats', async () => {
    fetchMock.mockResolvedValue(mockResponse([
      { symbol: 'okay_bears', name: 'Okay Bears', floorPrice: 10_000_000_000, listedCount: 80, volumeAll: 500_000_000_000 },
    ]));

    const results = await searchCollections('okay bears');

    expect(results).toHaveLength(1);
    expect(results[0].name).toBe('Okay Bears');
    expect(results[0].floorPrice.toNumber()).toBeCloseTo(10);
  });
});

// ────────────────────────── getWalletNFTs ──────────────────────────

describe('getWalletNFTs()', () => {
  it('fetches NFTs for a wallet address', async () => {
    const walletAddr = 'WALLETxADDRESS1111111111111111111111111111111';
    fetchMock.mockResolvedValue(mockResponse([
      { mintAddress: 'NFT1', name: 'Cool NFT', collection: 'cool' },
      { mintAddress: 'NFT2', name: 'Other NFT', collection: 'other' },
    ]));

    const nfts = await getWalletNFTs(walletAddr);

    expect(fetchMock).toHaveBeenCalledWith(
      `https://api-mainnet.magiceden.dev/v2/wallets/${walletAddr}/tokens?listStatus=both&limit=100`
    );
    expect(nfts).toHaveLength(2);
    expect(nfts[0].mintAddress).toBe('NFT1');
  });

  it('throws on API error', async () => {
    fetchMock.mockResolvedValue(mockResponse({}, false, 500));

    await expect(getWalletNFTs('addr')).rejects.toThrow('Failed to fetch wallet NFTs');
  });
});

// ────────────────────────── formatSol ──────────────────────────

describe('formatSol()', () => {
  it('formats Big amount to SOL string with 2 decimals', () => {
    expect(formatSol(new Big(1.5))).toBe('1.50 SOL');
    expect(formatSol(new Big(0))).toBe('0.00 SOL');
    expect(formatSol(new Big(123.456))).toBe('123.46 SOL');
  });
});

// ────────────────────────── solToUsd ──────────────────────────

describe('solToUsd()', () => {
  it('converts SOL to USD using default price (84)', () => {
    const result = solToUsd(new Big(10));
    expect(result.toNumber()).toBe(840);
  });

  it('converts SOL to USD using custom price', () => {
    const result = solToUsd(new Big(2), 150);
    expect(result.toNumber()).toBe(300);
  });
});
