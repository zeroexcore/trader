/**
 * Token information aggregation from multiple sources
 * - Helius DAS API for metadata and verification
 * - Jupiter for token list and verification status
 * - DexScreener for market data
 * - Birdeye for additional analytics
 */

export interface TokenInfo {
  // Basic Info
  address: string;
  symbol: string;
  name: string;
  decimals: number;
  
  // Market Data
  price?: number;
  priceChange24h?: number;
  volume24h?: number;
  volumeChange24h?: number;
  liquidity?: number;
  marketCap?: number;
  fdv?: number; // Fully Diluted Valuation
  
  // Supply Info
  supply?: number;
  
  // Verification & Trust
  verified?: boolean;
  verifiedSource?: string;
  freezeAuthority?: string | null;
  mintAuthority?: string | null;
  
  // Holders & Distribution
  holders?: number;
  
  // Links & Metadata
  logoUri?: string;
  description?: string;
  website?: string;
  twitter?: string;
  telegram?: string;
  discord?: string;
  
  // Trading Pairs
  markets?: {
    dex: string;
    pair: string;
    liquidity: number;
  }[];
  
  // Source attribution
  sources: string[];
}

/**
 * Get token info from Helius DAS API
 */
async function getHeliusTokenInfo(mintAddress: string): Promise<Partial<TokenInfo>> {
  const heliusApiKey = process.env.HELIUS_API_KEY;
  if (!heliusApiKey) {
    throw new Error('HELIUS_API_KEY not set');
  }

  const url = `https://mainnet.helius-rpc.com/?api-key=${heliusApiKey}`;
  
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 'token-info',
        method: 'getAsset',
        params: { id: mintAddress },
      }),
    });

    const { result } = await response.json() as any;
    
    if (!result) return {};

    return {
      address: mintAddress,
      symbol: result.content?.metadata?.symbol || '???',
      name: result.content?.metadata?.name || 'Unknown',
      decimals: result.token_info?.decimals || 0,
      price: result.token_info?.price_info?.price_per_token,
      supply: result.token_info?.supply,
      logoUri: result.content?.links?.image,
      verified: result.token_info?.price_info !== undefined,
      verifiedSource: 'helius',
      freezeAuthority: result.authorities?.find((a: any) => a.type === 'freeze')?.address,
      mintAuthority: result.authorities?.find((a: any) => a.type === 'mint')?.address,
    };
  } catch (error) {
    console.error('Helius error:', error);
    return {};
  }
}

/**
 * Get token holders count via Helius
 */
async function getTokenHolders(mintAddress: string): Promise<number | undefined> {
  const heliusApiKey = process.env.HELIUS_API_KEY;
  if (!heliusApiKey) return undefined;

  const url = `https://mainnet.helius-rpc.com/?api-key=${heliusApiKey}`;
  
  try {
    // Get largest token accounts (top 20)
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 'holders',
        method: 'getTokenLargestAccounts',
        params: [mintAddress],
      }),
    });

    const { result } = await response.json() as any;
    
    // This returns top 20, but doesn't give us total count
    // Would need getProgramAccounts for full count (expensive)
    return result?.value?.length;
  } catch (error) {
    return undefined;
  }
}

/**
 * Get token info from Jupiter
 */
async function getJupiterTokenInfo(mintAddress: string): Promise<Partial<TokenInfo>> {
  try {
    // Check if token is in verified list
    const verifiedResponse = await fetch('https://tokens.jup.ag/tokens?tags=verified');
    const verifiedTokens = await verifiedResponse.json() as any[];
    const verifiedToken = verifiedTokens.find((t: any) => t.address === mintAddress);

    if (verifiedToken) {
      return {
        symbol: verifiedToken.symbol,
        name: verifiedToken.name,
        decimals: verifiedToken.decimals,
        logoUri: verifiedToken.logoURI,
        verified: true,
        verifiedSource: 'jupiter',
      };
    }

    // Check strict list
    const strictResponse = await fetch('https://tokens.jup.ag/tokens?tags=strict');
    const strictTokens = await strictResponse.json() as any[];
    const strictToken = strictTokens.find((t: any) => t.address === mintAddress);

    if (strictToken) {
      return {
        symbol: strictToken.symbol,
        name: strictToken.name,
        decimals: strictToken.decimals,
        logoUri: strictToken.logoURI,
        verified: true,
        verifiedSource: 'jupiter-strict',
      };
    }

    // Check all tokens
    const allResponse = await fetch('https://tokens.jup.ag/tokens');
    const allTokens = await allResponse.json() as any[];
    const token = allTokens.find((t: any) => t.address === mintAddress);

    if (token) {
      return {
        symbol: token.symbol,
        name: token.name,
        decimals: token.decimals,
        logoUri: token.logoURI,
        verified: false,
      };
    }

    return {};
  } catch (error) {
    console.error('Jupiter error:', error);
    return {};
  }
}

/**
 * Get market data from DexScreener
 */
async function getDexScreenerInfo(mintAddress: string): Promise<Partial<TokenInfo>> {
  try {
    const response = await fetch(`https://api.dexscreener.com/latest/dex/tokens/${mintAddress}`);
    const data = await response.json() as any;

    if (!data.pairs || data.pairs.length === 0) {
      return {};
    }

    // Get the most liquid pair
    const mainPair = data.pairs.reduce((prev: any, current: any) => 
      (current.liquidity?.usd || 0) > (prev.liquidity?.usd || 0) ? current : prev
    );

    return {
      symbol: mainPair.baseToken?.symbol || mainPair.quoteToken?.symbol,
      name: mainPair.baseToken?.name || mainPair.quoteToken?.name,
      price: parseFloat(mainPair.priceUsd),
      priceChange24h: mainPair.priceChange?.h24,
      volume24h: mainPair.volume?.h24,
      liquidity: mainPair.liquidity?.usd,
      marketCap: mainPair.marketCap,
      fdv: mainPair.fdv,
      markets: data.pairs.slice(0, 5).map((p: any) => ({
        dex: p.dexId,
        pair: p.pairAddress,
        liquidity: p.liquidity?.usd || 0,
      })),
      website: mainPair.info?.websites?.[0]?.url || mainPair.info?.websites?.[0],
      twitter: mainPair.info?.socials?.find((s: any) => s.type === 'twitter')?.url,
      telegram: mainPair.info?.socials?.find((s: any) => s.type === 'telegram')?.url,
      discord: mainPair.info?.socials?.find((s: any) => s.type === 'discord')?.url,
    };
  } catch (error) {
    console.error('DexScreener error:', error);
    return {};
  }
}

/**
 * Get additional analytics from Birdeye
 */
async function getBirdeyeInfo(mintAddress: string): Promise<Partial<TokenInfo>> {
  // Note: Birdeye requires API key for most endpoints
  // Using public endpoints only
  try {
    const response = await fetch(
      `https://public-api.birdeye.so/public/token_overview?address=${mintAddress}`,
      {
        headers: {
          'X-API-KEY': process.env.BIRDEYE_API_KEY || '',
        },
      }
    );

    if (!response.ok) return {};

    const data = await response.json() as any;
    
    if (!data.success || !data.data) return {};

    return {
      price: data.data.price,
      priceChange24h: data.data.priceChange24h,
      volume24h: data.data.volume24h,
      volumeChange24h: data.data.volume24hChange,
      liquidity: data.data.liquidity,
      marketCap: data.data.mc,
      holders: data.data.holder,
    };
  } catch (error) {
    // Fail silently if no API key
    return {};
  }
}

/**
 * Aggregate token info from all sources
 * Simplified to use only Helius + DexScreener (most reliable)
 */
export async function getTokenInfo(mintOrSymbol: string): Promise<TokenInfo> {
  let mintAddress = mintOrSymbol;
  
  // If it looks like a symbol, check our token book first
  if (mintOrSymbol.length < 32) {
    // Try token book first (from tokens.json)
    try {
      const tokenBookPath = require('path').join(process.cwd(), 'tokens.json');
      const fs = require('fs');
      if (fs.existsSync(tokenBookPath)) {
        const book = JSON.parse(fs.readFileSync(tokenBookPath, 'utf-8'));
        const upperSymbol = mintOrSymbol.toUpperCase();
        if (book[upperSymbol]) {
          mintAddress = book[upperSymbol];
          console.log(`✅ Found ${upperSymbol} in token book`);
        }
      }
    } catch (e) {
      // Token book not found, continue
    }
    
    // If still a symbol (not found in book), it must be provided as address
    if (mintAddress.length < 32) {
      throw new Error(`Token symbol '${mintOrSymbol}' not found in token book. Use address or add to book with: npx tsx src/cli.ts book add ${mintOrSymbol.toUpperCase()} <address>`);
    }
  }

  console.log(`🔍 Fetching token info from Helius + DexScreener...`);

  // Fetch from working sources only (skip Jupiter tokens API due to Node fetch issues)
  const [helius, dexscreener, holders] = await Promise.all([
    getHeliusTokenInfo(mintAddress),
    getDexScreenerInfo(mintAddress),
    getTokenHolders(mintAddress),
  ]);

  // Merge data with priority: Helius > DexScreener
  const merged: TokenInfo = {
    address: mintAddress,
    symbol: helius.symbol || dexscreener.symbol || '???',
    name: helius.name || dexscreener.name || 'Unknown',
    decimals: helius.decimals || 9,
    
    // Market data - prefer DexScreener for real-time prices
    price: dexscreener.price || helius.price,
    priceChange24h: dexscreener.priceChange24h,
    volume24h: dexscreener.volume24h,
    liquidity: dexscreener.liquidity,
    marketCap: dexscreener.marketCap,
    fdv: dexscreener.fdv,
    
    // Supply
    supply: helius.supply,
    
    // Verification (from Helius only since we're not calling Jupiter API)
    verified: helius.verified || false,
    verifiedSource: helius.verifiedSource,
    freezeAuthority: helius.freezeAuthority,
    mintAuthority: helius.mintAuthority,
    
    // Holders
    holders: holders,
    
    // Links
    logoUri: helius.logoUri,
    description: helius.description,
    website: dexscreener.website,
    twitter: dexscreener.twitter,
    telegram: dexscreener.telegram,
    discord: dexscreener.discord,
    
    // Markets
    markets: dexscreener.markets,
    
    // Source tracking
    sources: [
      helius.symbol ? 'helius' : '',
      dexscreener.price ? 'dexscreener' : '',
    ].filter(Boolean),
  };

  return merged;
}

/**
 * Format token info for display
 */
export function formatTokenInfo(info: TokenInfo): string {
  const sections: string[] = [];

  // Header
  sections.push(`
╔════════════════════════════════════════════════════════════
║ ${info.name} (${info.symbol})
║ ${info.address}
╚════════════════════════════════════════════════════════════
`);

  // Verification
  const verificationEmoji = info.verified ? '✅' : '❌';
  sections.push(`
📜 VERIFICATION
   Status: ${verificationEmoji} ${info.verified ? 'Verified' : 'Not Verified'}${info.verifiedSource ? ` (${info.verifiedSource})` : ''}
   Mint Authority: ${info.mintAuthority || 'None (immutable)'}
   Freeze Authority: ${info.freezeAuthority || 'None'}
`);

  // Market Data
  if (info.price !== undefined) {
    const priceChange = info.priceChange24h 
      ? `${info.priceChange24h > 0 ? '📈' : '📉'} ${info.priceChange24h.toFixed(2)}%`
      : 'N/A';
      
    sections.push(`
💰 MARKET DATA
   Price: $${info.price.toFixed(info.price < 1 ? 6 : 2)}
   24h Change: ${priceChange}
   Market Cap: ${info.marketCap ? `$${(info.marketCap / 1e6).toFixed(2)}M` : 'N/A'}
   FDV: ${info.fdv ? `$${(info.fdv / 1e6).toFixed(2)}M` : 'N/A'}
`);
  }

  // Volume & Liquidity
  if (info.volume24h !== undefined || info.liquidity !== undefined) {
    sections.push(`
📊 LIQUIDITY & VOLUME
   24h Volume: ${info.volume24h ? `$${(info.volume24h / 1e3).toFixed(1)}K` : 'N/A'}
   Liquidity: ${info.liquidity ? `$${(info.liquidity / 1e3).toFixed(1)}K` : 'N/A'}
`);
  }

  // Supply & Holders
  sections.push(`
🪙 SUPPLY & HOLDERS
   Total Supply: ${info.supply ? info.supply.toLocaleString() : 'N/A'}
   Holders: ${info.holders ? info.holders.toLocaleString() : 'N/A'}
   Decimals: ${info.decimals}
`);

  // Links
  const links: string[] = [];
  if (info.website) links.push(`Website: ${info.website}`);
  if (info.twitter) links.push(`Twitter: ${info.twitter}`);
  if (info.telegram) links.push(`Telegram: ${info.telegram}`);
  if (info.discord) links.push(`Discord: ${info.discord}`);
  
  if (links.length > 0) {
    sections.push(`
🔗 LINKS
   ${links.join('\n   ')}
`);
  }

  // Markets
  if (info.markets && info.markets.length > 0) {
    sections.push(`
🏪 TOP MARKETS
${info.markets.map(m => 
  `   ${m.dex.toUpperCase()}: $${(m.liquidity / 1e3).toFixed(1)}K liquidity`
).join('\n')}
`);
  }

  // Footer
  sections.push(`
📡 Data Sources: ${info.sources.join(', ')}
`);

  return sections.join('');
}
