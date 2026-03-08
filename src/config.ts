/**
 * Centralized configuration for trader CLI
 * All env vars, API endpoints, and constants in one place
 */

import path from 'path';

// ============================================================================
// Environment Variables
// ============================================================================

export const env = {
  /** Helius API key for RPC and DAS API (free at https://dev.helius.xyz) */
  heliusApiKey: () => process.env.HELIUS_API_KEY,
  
  /** Jupiter API key for swaps and predictions (free at https://portal.jup.ag) */
  jupiterApiKey: () => process.env.JUPITER_API_KEY,
  
  /** Wallet encryption password */
  walletPassword: () => process.env.WALLET_PASSWORD,
  
  /** Optional: Override RPC URL */
  rpcUrl: () => process.env.RPC_URL,
  
  /** Birdeye API key for additional token analytics */
  birdeyeApiKey: () => process.env.BIRDEYE_API_KEY,
  
  /** Use Helius Sender for ultra-low latency transaction submission */
  useHeliusSender: () => process.env.USE_HELIUS_SENDER === 'true',
  
  /** Home directory */
  home: () => process.env.HOME || '',
};

// ============================================================================
// Directories & Paths
// ============================================================================

export const paths = {
  /** OpenClaw data directory */
  openclawDir: () => path.join(env.home(), '.openclaw'),
  
  /** Encrypted wallet file */
  walletFile: () => path.join(env.home(), '.openclaw', 'trader-wallet.enc'),
  
  /** Position tracking file */
  positionsFile: () => path.join(env.home(), '.openclaw', 'trader-positions.json'),
  
  /** Token address book */
  tokenBook: () => path.join(env.home(), '.openclaw', 'trader-tokens.json'),
};

// ============================================================================
// API Endpoints
// ============================================================================

export const apis = {
  // Helius
  heliusRpc: (apiKey: string) => `https://mainnet.helius-rpc.com/?api-key=${apiKey}`,
  heliusTransactions: (address: string, apiKey: string) => 
    `https://api.helius.xyz/v0/addresses/${address}/transactions?api-key=${apiKey}`,
  
  // Jupiter
  jupiterUltra: 'https://api.jup.ag/ultra/v1',
  jupiterQuote: 'https://quote-api.jup.ag/v6/quote',
  jupiterTokenSearch: 'https://api.jup.ag/tokens/v2/search',
  jupiterTokenTag: 'https://api.jup.ag/tokens/v2/tag',
  jupiterTokenTop: 'https://api.jup.ag/tokens/v2/toporganicscore/24h',
  jupiterPrediction: 'https://api.jup.ag/prediction/v1',
  jupiterPerps: 'https://perps-api.jup.ag/v1',
  jupiterRecurring: 'https://api.jup.ag/recurring/v1',
  jupiterTrigger: 'https://api.jup.ag/trigger/v1',
  
  // Solana public RPC (fallback)
  solanaMainnet: 'https://api.mainnet-beta.solana.com',
};

// ============================================================================
// Token Addresses (Mainnet)
// ============================================================================

export const tokens = {
  // Native
  SOL: 'So11111111111111111111111111111111111111112',
  
  // Stablecoins
  USDC: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
  USDT: 'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB',
  
  // Wrapped
  WBTC: '3NZ9JMVBmGAqocybic2c7LQCJScmgsAZ6vQqTDzcqmJh',
  WETH: '7vfCXTUXx5WJV5JADk17DUJ4ksgau7utNKj4b963voxs',
  
  // Jupiter
  JUP: 'JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN',
  JupUSD: 'JuprjznTrTSp2UFa3ZBUFgwdAmtZCq4MQCwysN55USD',
  
  // Other
  GLDx: 'Xsv9hRk1z5ystj9MhnA7Lq4vjSsLwzL2nxrwmwtD3re',
  RAY: '4k3Dyjzvzp8eMZWUXbBCjEvwSkkk59S5iCNLY3QrkX6R',
};

// Default token book entries
export const defaultTokenBook: Record<string, string> = {
  SOL: tokens.SOL,
  USDC: tokens.USDC,
  USDT: tokens.USDT,
  WBTC: tokens.WBTC,
  WETH: tokens.WETH,
  JUP: tokens.JUP,
  JupUSD: tokens.JupUSD,
  GLDx: tokens.GLDx,
  RAY: tokens.RAY,
};

// ============================================================================
// Safety Limits
// ============================================================================

export const safety = {
  /** Minimum SOL to keep in wallet for gas fees. Swaps selling SOL will be rejected if balance would drop below this. */
  minSolReserve: 0.05,
};

// Token decimals cache
const tokenDecimals: Record<string, number> = {
  [tokens.SOL]: 9,
  [tokens.USDC]: 6,
  [tokens.USDT]: 6,
  [tokens.WBTC]: 8,
  [tokens.WETH]: 8,
  [tokens.JUP]: 6,
  [tokens.JupUSD]: 6,
  [tokens.GLDx]: 8,
  [tokens.RAY]: 6,
};

// ============================================================================
// Jupiter Perpetuals
// ============================================================================

export const perps = {
  programId: 'PERPHjGBqRHArX4DySjwM6UJHiR3sWAatqfdBS2qQJu',
  poolAccount: '5BUwFW4nRbftYTDMbgxykoFWqWHPzahFSNAaaaJtVKsq',
  
  custody: {
    SOL: '7xS2gz2bTp3fwCC7knJvUWTEU9Tycczu6VhJYKgi1wdz',
    ETH: 'AQCGyheWPLeo6Qp9WpYS9m3Qj479t7R636N9ey1rEjEn',
    BTC: '5Pv3gM9JrFFH883SWAhvJC9RPYmo8UNxuFtv5bMMALkm',
    USDC: 'G18jKKXQwBbrHeiK3C9MRXhkHsLHf7XgCSisykV46EZa',
    USDT: '4vkNeXiYEUizLdrpdPS1eC2mccyM4NUPRtERrk6ZETkk',
  },
};

// ============================================================================
// Explorer URLs
// ============================================================================

export const explorers = {
  solscanTx: (sig: string) => `https://solscan.io/tx/${sig}`,
  solscanToken: (mint: string) => `https://solscan.io/token/${mint}`,
  solanaExplorer: (address: string) => `https://explorer.solana.com/address/${address}`,
  dexscreener: (pair: string) => `https://dexscreener.com/solana/${pair}`,
  jupPerps: 'https://jup.ag/perps',
};

// ============================================================================
// Helpers
// ============================================================================

/** Get RPC URL - prefers HELIUS_API_KEY, falls back to RPC_URL or public */
export function getRpcUrl(): string {
  const rpcUrl = env.rpcUrl();
  if (rpcUrl) return rpcUrl;
  
  const heliusKey = env.heliusApiKey();
  if (heliusKey) return apis.heliusRpc(heliusKey);
  
  return apis.solanaMainnet;
}

/** Require Helius API key or throw */
export function requireHeliusKey(): string {
  const key = env.heliusApiKey();
  if (!key) {
    throw new Error('HELIUS_API_KEY not set. Get free key at https://dev.helius.xyz');
  }
  return key;
}

/** Require Jupiter API key or throw */
export function requireJupiterKey(): string {
  const key = env.jupiterApiKey();
  if (!key) {
    throw new Error('JUPITER_API_KEY not set. Get free key at https://portal.jup.ag');
  }
  return key;
}

/** Require wallet password or throw */
export function requirePassword(): string {
  const password = env.walletPassword();
  if (!password) {
    throw new Error('WALLET_PASSWORD environment variable required');
  }
  return password;
}

/** Get token decimals from cache or default to 9 */
export function getDecimalsFromCache(mint: string): number | undefined {
  return tokenDecimals[mint];
}
