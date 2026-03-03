import Big from 'big.js';

// Magic Eden API
const ME_API = 'https://api-mainnet.magiceden.dev/v2';

// Collector Crypt Gacha API
const CC_GACHA_API = 'https://gacha.collectorcrypt.com/api';

// Lamports to SOL
const LAMPORTS = new Big(1_000_000_000);

export interface NFTListing {
  mint: string;
  name: string;
  image: string;
  price: Big;
  seller: string;
  collection: string;
  attributes?: Record<string, string>;
}

export interface CollectionStats {
  symbol: string;
  name: string;
  floorPrice: Big;
  listedCount: number;
  volumeAll: Big;
}

export interface CryptCard {
  mint: string;
  name: string;
  image: string;
  insuredValue: number;
  grade?: string;
  gradeNum?: number;
  year?: string;
  category: string;
  rarity?: string;
}

export interface GachaStock {
  common: number;
  uncommon: number;
  rare: number;
  epic: number;
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
  const data = await response.json();
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
  const data = await response.json();
  
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
    }, {}),
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
  const data = await response.json();
  
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
  const data = await response.json();
  
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
  return response.json();
}

// ============ Collector Crypt ============

/**
 * Get gacha machine stock
 */
export async function getGachaStock(): Promise<Record<string, GachaStock>> {
  const response = await fetch(`${CC_GACHA_API}/stock`);
  if (!response.ok) {
    throw new Error('Failed to fetch gacha stock');
  }
  return response.json();
}

/**
 * Get cards available in gacha by rarity
 */
export async function getGachaCards(
  packType: 'pokemon_50' | 'pokemon_250' | 'pokemon_1000' = 'pokemon_50',
  rarity?: 'common' | 'uncommon' | 'rare' | 'epic'
): Promise<CryptCard[]> {
  let url = `${CC_GACHA_API}/getNfts?code=${packType}`;
  if (rarity) {
    url += `&rarity=${rarity}`;
  }
  
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error('Failed to fetch gacha cards');
  }
  const data = await response.json();
  
  return (data.nfts || []).map((item: any) => {
    const attrs = item.content?.metadata?.attributes || [];
    const getAttr = (key: string) => attrs.find((a: any) => a.trait_type === key)?.value;
    
    return {
      mint: item.id,
      name: item.content?.metadata?.name || 'Unknown',
      image: item.content?.links?.image || '',
      insuredValue: parseInt(getAttr('Insured Value') || '0'),
      grade: getAttr('The Grade'),
      gradeNum: parseInt(getAttr('GradeNum') || '0'),
      year: getAttr('Year'),
      category: getAttr('Category') || 'Pokemon',
      rarity: rarity,
    };
  });
}

/**
 * Get Pokemon listings from Collector Crypt on Magic Eden
 */
export async function getCryptListings(limit = 50): Promise<NFTListing[]> {
  const listings = await getListings('collector_crypt', limit);
  
  // Filter to Pokemon only and enrich with card data
  return listings.filter(l => {
    const category = l.attributes?.['Category'];
    return category === 'Pokemon';
  }).map(l => ({
    ...l,
    attributes: {
      ...l.attributes,
      insuredValue: l.attributes?.['Insured Value'],
      grade: l.attributes?.['The Grade'],
      year: l.attributes?.['Year'],
    },
  }));
}

/**
 * Get gacha machine status
 */
export async function getGachaStatus(): Promise<{ machineStatus: string }> {
  const response = await fetch(`${CC_GACHA_API}/status`);
  if (!response.ok) {
    throw new Error('Failed to fetch gacha status');
  }
  return response.json();
}

// ============ Helpers ============

export function formatSol(amount: Big): string {
  return `${amount.toFixed(2)} SOL`;
}

export function solToUsd(sol: Big, solPrice = 84): Big {
  return sol.times(solPrice);
}
