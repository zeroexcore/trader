import Big from 'big.js';

// Magic Eden API
const ME_API = 'https://api-mainnet.magiceden.dev/v2';

// Lamports to SOL
const LAMPORTS = new Big(1_000_000_000);

interface NFTListing {
  mint: string;
  name: string;
  image: string;
  price: Big;
  seller: string;
  collection: string;
  attributes?: Record<string, string>;
}

interface CollectionStats {
  symbol: string;
  name: string;
  floorPrice: Big;
  listedCount: number;
  volumeAll: Big;
}

// ============ Magic Eden ============

/**
 * Get collection stats including floor price
 */
export async function getCollectionStats(symbol: string): Promise<CollectionStats> {
  const response = await fetch(`${ME_API}/collections/${symbol}/stats`);
  if (!response.ok) {
    throw new Error(`Collection not found: ${symbol}`);
  }
  const data: any = await response.json();
  return {
    symbol: data.symbol,
    name: data.symbol,
    floorPrice: new Big(data.floorPrice || 0).div(LAMPORTS),
    listedCount: data.listedCount || 0,
    volumeAll: new Big(data.volumeAll || 0).div(LAMPORTS),
  };
}

/**
 * Get listings for a collection
 */
export async function getListings(symbol: string, limit = 20): Promise<NFTListing[]> {
  const response = await fetch(`${ME_API}/collections/${symbol}/listings?limit=${limit}`);
  if (!response.ok) {
    throw new Error(`Failed to fetch listings for ${symbol}`);
  }
  const data: any = await response.json();
  
  return data.map((item: any) => ({
    mint: item.tokenMint,
    name: item.token?.name || 'Unknown',
    image: item.token?.image || item.extra?.img || '',
    price: new Big(item.price || 0),
    seller: item.seller,
    collection: symbol,
    attributes: item.token?.attributes?.reduce((acc: any, attr: any) => {
      acc[attr.trait_type] = attr.value;
      return acc;
    }, {}) || {},
  }));
}

/**
 * Get popular collections
 */
export async function getPopularCollections(limit = 50): Promise<CollectionStats[]> {
  const response = await fetch(`${ME_API}/marketplace/popular_collections?timeRange=1d&limit=${limit}`);
  if (!response.ok) {
    throw new Error('Failed to fetch popular collections');
  }
  const data: any = await response.json();
  
  return data.map((item: any) => ({
    symbol: item.symbol,
    name: item.name || item.symbol,
    floorPrice: new Big(item.floorPrice || 0).div(LAMPORTS),
    listedCount: item.listedCount || 0,
    volumeAll: new Big(item.volumeAll || 0).div(LAMPORTS),
  }));
}

/**
 * Search collections by name
 */
export async function searchCollections(query: string): Promise<CollectionStats[]> {
  const response = await fetch(`${ME_API}/collections?name=${encodeURIComponent(query)}&limit=20`);
  if (!response.ok) {
    throw new Error('Failed to search collections');
  }
  const data: any = await response.json();
  
  return data.map((item: any) => ({
    symbol: item.symbol,
    name: item.name || item.symbol,
    floorPrice: new Big(item.floorPrice || 0).div(LAMPORTS),
    listedCount: item.listedCount || 0,
    volumeAll: new Big(item.volumeAll || 0).div(LAMPORTS),
  }));
}

/**
 * Get NFTs owned by a wallet
 */
export async function getWalletNFTs(walletAddress: string): Promise<any[]> {
  const response = await fetch(`${ME_API}/wallets/${walletAddress}/tokens?listStatus=both&limit=100`);
  if (!response.ok) {
    throw new Error('Failed to fetch wallet NFTs');
  }
  return response.json() as Promise<any[]>;
}

// ============ Helpers ============

export function formatSol(amount: Big): string {
  return `${amount.toFixed(2)} SOL`;
}

export function solToUsd(sol: Big, solPrice = 84): Big {
  return sol.times(solPrice);
}
