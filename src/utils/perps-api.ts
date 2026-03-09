import BN from 'bn.js';
import { Connection, Keypair, PublicKey, VersionedTransaction } from '@solana/web3.js';
import { apis, requireJupiterKey } from '../config.js';
import { sendAndConfirmTransaction } from './solana.js';
import {
  buildIncreasePositionTx,
  buildDecreasePositionTx,
  buildTpslTx,
  buildTpslPairTx,
  getOpenPositions as getOnChainPositions,
  resolveCustodies,
  derivePositionPda,
  type Side,
} from './perps/index.js';

// ============================================================================
// Perps token mints
// ============================================================================

export const PERPS_MINTS: Record<string, string> = {
  SOL: 'So11111111111111111111111111111111111111112',
  ETH: '7vfCXTUXx5WJV5JADk17DUJ4ksgau7utNKj4b963voxs',
  BTC: '3NZ9JMVBmGAqocybic2c7LQCJScmgsAZ6vQqTDzcqmJh',
};

export const PERPS_ASSETS = ['SOL', 'ETH', 'BTC'] as const;
export type PerpsAsset = (typeof PERPS_ASSETS)[number];
export type PerpsSide = 'long' | 'short';
export type PerpsToken = PerpsAsset | 'USDC';

// ============================================================================
// Response types (kept for command compatibility)
// ============================================================================

export interface TriggerOrderInfo {
  pubkey: string;
  triggerPriceUsd: string;  // 6-decimal raw
  triggerAboveThreshold: boolean;
  entirePosition: boolean;
  label: string;  // 'TP' or 'SL'
}

export interface PerpsPosition {
  asset: string;
  side: PerpsSide;
  leverage: string;
  sizeUsd: string;
  collateralUsd: string;
  entryPriceUsd: string;
  markPriceUsd: string;
  liquidationPriceUsd: string;
  pnlAfterFeesUsd: string;
  pnlAfterFeesPct: string;
  positionPubkey: string;
  tpPriceUsd?: string;   // highest TP trigger (6-decimal raw)
  slPriceUsd?: string;   // lowest SL trigger (6-decimal raw)
  triggerOrders: TriggerOrderInfo[];
}

export interface PerpsPositionsResponse {
  dataList: PerpsPosition[];
  count: number;
}

export interface MarketStats {
  price: number;
  priceChange24H: number;
  priceHigh24H: number;
  priceLow24H: number;
  volume: number;
}

export interface PoolInfo {
  longAvailableLiquidity: string;
  longBorrowRatePercent: string;
  longUtilizationPercent: string;
  shortAvailableLiquidity: string;
  shortBorrowRatePercent: string;
  shortUtilizationPercent: string;
  openFeePercent: string;
}

export const DEFAULT_SLIPPAGE_BPS = 30; // 0.3% — covers normal 45s keeper execution window

export interface IncreasePositionParams {
  asset: PerpsAsset;
  inputToken: PerpsToken;
  inputTokenAmount: string; // raw decimals
  leverage?: string;
  sizeUsdDelta?: string; // raw 6 decimal
  side: PerpsSide;
  slippageBps?: number; // defaults to DEFAULT_SLIPPAGE_BPS
  walletAddress: string;
}

export interface DecreasePositionParams {
  positionPubkey: string;
  receiveToken: PerpsToken;
  entirePosition?: boolean;
  sizeUsdDelta?: string;
  collateralUsdDelta?: string;
  slippageBps?: number; // defaults to DEFAULT_SLIPPAGE_BPS
}

/**
 * Compute priceSlippage from oracle price.
 *
 * priceSlippage is NOT a percentage — it's an absolute USD price (6 decimals).
 * It acts as a guard rail; the keeper always fills at oracle price.
 * Wider slippage does NOT give worse fills, it only reduces rejection risk.
 *
 * - increase long / decrease short: ceiling (current price + buffer)
 * - decrease long / increase short: floor (current price - buffer)
 */
export function computePriceSlippage(
  oraclePrice: number,
  slippageBps: number,
  side: PerpsSide,
  action: 'increase' | 'decrease',
): BN {
  const needCeiling =
    (action === 'increase' && side === 'long') ||
    (action === 'decrease' && side === 'short');
  const pct = slippageBps / 10000;
  const multiplier = needCeiling ? (1 + pct) : (1 - pct);
  return new BN(Math.round(oraclePrice * multiplier * 1_000_000));
}

// ============================================================================
// REST API fetch helper (for read-only endpoints that still work)
// ============================================================================

async function perpsFetch<T>(path: string, options?: RequestInit): Promise<T> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...options?.headers as Record<string, string>,
  };
  // API key is optional for perps endpoints
  try { headers['x-api-key'] = requireJupiterKey(); } catch {}
  
  const response = await fetch(`${apis.jupiterPerps}${path}`, {
    ...options,
    headers,
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Perps API error (${response.status}): ${errorText}`);
  }

  return response.json() as Promise<T>;
}

// ============================================================================
// Read-only API functions (REST — these still work)
// ============================================================================

export async function getMarketStats(mint: string): Promise<MarketStats> {
  const params = new URLSearchParams({ mint });
  return perpsFetch<MarketStats>(`/market-stats?${params}`);
}

export async function getPoolInfo(mint: string): Promise<PoolInfo> {
  return perpsFetch<PoolInfo>(`/pool-info?${mkParams(mint)}`);
}

function mkParams(mint: string): string {
  return new URLSearchParams({ mint }).toString();
}

// Mint -> asset name mapping
const MINT_TO_ASSET: Record<string, string> = {
  'So11111111111111111111111111111111111111112': 'SOL',
  '7vfCXTUXx5WJV5JADk17DUJ4ksgau7utNKj4b963voxs': 'ETH',
  '3NZ9JMVBmGAqocybic2c7LQCJScmgsAZ6vQqTDzcqmJh': 'BTC',
};

/** Normalize REST API position response to our PerpsPosition shape */
function normalizeApiPosition(raw: any): PerpsPosition {
  return {
    asset: MINT_TO_ASSET[raw.marketMint] || raw.marketMint || raw.asset || 'UNKNOWN',
    side: raw.side,
    leverage: raw.leverage,
    sizeUsd: raw.sizeUsdDelta || raw.sizeUsd || '0',
    collateralUsd: raw.collateralUsd || '0',
    entryPriceUsd: String(Math.floor(Number(raw.entryPrice || 0) * 1_000_000)),
    markPriceUsd: String(Math.floor(Number(raw.markPrice || 0) * 1_000_000)),
    liquidationPriceUsd: String(Math.floor(Number(raw.liquidationPrice || 0) * 1_000_000)),
    pnlAfterFeesUsd: raw.pnlAfterFees || raw.pnlAfterFeesUsd || '0',
    pnlAfterFeesPct: raw.pnlChangePctAfterFees || raw.pnlAfterFeesPct || '0',
    positionPubkey: raw.positionPubkey,
    triggerOrders: [],
  };
}

/** Fetch positions from on-chain with live mark prices, PnL, and liquidation */
export async function getPerpsPositions(
  walletAddress: string,
  connection: Connection,
): Promise<PerpsPositionsResponse> {
  // Fetch mark prices for all perps assets in parallel
  const assetMints = Object.entries(PERPS_MINTS);
  const statsResults = await Promise.allSettled(
    assetMints.map(([, mint]) => getMarketStats(mint)),
  );
  const markPrices: Record<string, number> = {};
  assetMints.forEach(([name], i) => {
    const r = statsResults[i];
    if (r.status === 'fulfilled') markPrices[name] = Number(r.value.price);
  });

  const positions = await getOnChainPositions(connection, walletAddress, markPrices);
  return {
    count: positions.length,
    dataList: positions.map(p => {
      const mark = markPrices[p.custody] ?? 0;
      const pnlPct = p.collateralUsd.gt(0)
        ? p.unrealizedPnl.div(p.collateralUsd).mul(100).toFixed(1)
        : '0';
      const isLong = p.side === 'long';

      // Classify trigger orders as TP or SL based on side
      const triggerOrders: TriggerOrderInfo[] = p.triggerOrders.map(t => ({
        pubkey: t.pubkey,
        triggerPriceUsd: t.triggerPrice.mul(1_000_000).toFixed(0),
        triggerAboveThreshold: t.triggerAboveThreshold,
        entirePosition: t.entirePosition,
        // Long: above=TP, below=SL. Short: above=SL, below=TP
        label: (isLong === t.triggerAboveThreshold) ? 'TP' : 'SL',
      }));

      // Pick the effective TP and SL prices
      const tpOrders = triggerOrders.filter(t => t.label === 'TP');
      const slOrders = triggerOrders.filter(t => t.label === 'SL');
      // For TP: use the nearest (lowest for long, highest for short)
      // For SL: use the nearest (highest for long, lowest for short)
      const tpPriceUsd = tpOrders.length > 0
        ? tpOrders.reduce((best, t) => {
            const price = Number(t.triggerPriceUsd);
            const bestPrice = Number(best.triggerPriceUsd);
            return isLong ? (price < bestPrice ? t : best) : (price > bestPrice ? t : best);
          }).triggerPriceUsd
        : undefined;
      const slPriceUsd = slOrders.length > 0
        ? slOrders.reduce((best, t) => {
            const price = Number(t.triggerPriceUsd);
            const bestPrice = Number(best.triggerPriceUsd);
            return isLong ? (price > bestPrice ? t : best) : (price < bestPrice ? t : best);
          }).triggerPriceUsd
        : undefined;

      return {
        asset: p.custody,
        side: p.side,
        leverage: p.leverage.toFixed(1),
        sizeUsd: p.sizeUsd.mul(1_000_000).toFixed(0),
        collateralUsd: p.collateralUsd.mul(1_000_000).toFixed(0),
        entryPriceUsd: p.entryPrice.mul(1_000_000).toFixed(0),
        markPriceUsd: Math.floor(mark * 1_000_000).toString(),
        liquidationPriceUsd: p.liquidationPrice.mul(1_000_000).toFixed(0),
        pnlAfterFeesUsd: p.unrealizedPnl.mul(1_000_000).toFixed(0),
        pnlAfterFeesPct: pnlPct,
        positionPubkey: p.publicKey,
        tpPriceUsd,
        slPriceUsd,
        triggerOrders,
      };
    }),
  };
}

// ============================================================================
// Trading functions (on-chain via Anchor — replaces broken REST endpoints)
// ============================================================================

/**
 * Build an increase-position (open) transaction on-chain.
 * Returns a VersionedTransaction ready for signing.
 */
export async function buildIncreasePositionTransaction(
  connection: Connection,
  params: IncreasePositionParams,
): Promise<{ tx: VersionedTransaction; positionPubkey: string }> {
  const owner = new PublicKey(params.walletAddress);
  const collateralAmount = new BN(params.inputTokenAmount);

  // Compute sizeUsdDelta from leverage if not provided directly
  let sizeUsdDelta: BN;
  if (params.sizeUsdDelta) {
    sizeUsdDelta = new BN(params.sizeUsdDelta);
  } else if (params.leverage) {
    // Estimate: sizeUsd = collateral_in_usd * leverage
    const decimals = perpsTokenDecimals(params.inputToken);
    const tokenAmount = Number(params.inputTokenAmount) / Math.pow(10, decimals);
    let collateralUsd: number;
    if (params.inputToken === 'USDC') {
      collateralUsd = tokenAmount; // USDC is 1:1 USD
    } else {
      const mint = assetToMint(params.inputToken);
      const tokenStats = await getMarketStats(mint);
      collateralUsd = tokenAmount * Number(tokenStats.price);
    }
    sizeUsdDelta = new BN(Math.floor(collateralUsd * Number(params.leverage) * 1_000_000));
  } else {
    throw new Error('Either sizeUsdDelta or leverage must be provided');
  }

  // Fetch oracle price and compute slippage guard
  const assetMint = assetToMint(params.asset);
  const stats = await getMarketStats(assetMint);
  const slippageBps = params.slippageBps ?? DEFAULT_SLIPPAGE_BPS;
  const oraclePrice = Number(stats.price);
  const priceSlippage = computePriceSlippage(oraclePrice, slippageBps, params.side, 'increase');

  // Derive position pubkey
  const { custody, collateralCustody } = resolveCustodies(params.asset, params.side);
  const positionPubkey = derivePositionPda(owner, custody, collateralCustody, params.side);

  // jupiterMinimumOut is needed when inputToken differs from the collateral token,
  // requiring the program to swap internally.
  // - Longs: collateral = asset (SOL/ETH/BTC). Cross-token if inputToken != asset
  // - Shorts: collateral = USDC. Cross-token if inputToken != USDC
  let jupiterMinimumOut: BN | undefined;
  const collateralToken = params.side === 'long' ? params.asset : 'USDC';
  const isCrossToken = params.inputToken.toUpperCase() !== collateralToken.toUpperCase();
  if (isCrossToken) {
    const decimals = perpsTokenDecimals(params.inputToken);
    const inputAmount = Number(params.inputTokenAmount) / Math.pow(10, decimals);
    const collateralDecimals = perpsTokenDecimals(collateralToken as PerpsToken);
    // Estimate output amount with 2% slippage buffer
    let outAmount: number;
    if (collateralToken === 'USDC') {
      // Selling asset for USDC: inputAmount * assetPrice
      outAmount = inputAmount * oraclePrice;
    } else {
      // Buying asset with USDC (or other): inputAmount / assetPrice
      outAmount = inputAmount / oraclePrice;
    }
    const minOut = Math.floor(outAmount * 0.98 * Math.pow(10, collateralDecimals));
    jupiterMinimumOut = new BN(minOut);
  }

  const tx = await buildIncreasePositionTx(connection, {
    owner,
    market: params.asset as any,
    side: params.side,
    collateralToken: params.inputToken,
    collateralAmount,
    sizeUsdDelta,
    priceSlippage,
    jupiterMinimumOut,
  });

  return { tx, positionPubkey: positionPubkey.toBase58() };
}

/**
 * Build a decrease-position (close/reduce) transaction on-chain.
 * Fetches position data to determine side + asset for proper slippage.
 */
export async function buildDecreasePositionTransaction(
  connection: Connection,
  params: DecreasePositionParams,
  /** Pass side + asset if already known (avoids extra on-chain fetch for slippage calc) */
  positionInfo?: { side: PerpsSide; asset: PerpsAsset },
): Promise<{ tx: VersionedTransaction; positionPubkey: string }> {
  const positionPubkey = new PublicKey(params.positionPubkey);
  const slippageBps = params.slippageBps ?? DEFAULT_SLIPPAGE_BPS;

  if (!positionInfo) throw new Error('positionInfo (side + asset) required for slippage calculation');
  const { side, asset } = positionInfo;

  // Fetch oracle price and compute slippage guard
  const assetMint = assetToMint(asset);
  const stats = await getMarketStats(assetMint);
  const oraclePrice = Number(stats.price);
  const priceSlippage = computePriceSlippage(oraclePrice, slippageBps, side, 'decrease');

  const tx = await buildDecreasePositionTx(connection, {
    owner: positionPubkey, // unused — fetched from position account
    positionPubkey,
    desiredToken: params.receiveToken,
    sizeUsdDelta: params.sizeUsdDelta ? new BN(params.sizeUsdDelta) : undefined,
    collateralUsdDelta: params.collateralUsdDelta ? new BN(params.collateralUsdDelta) : undefined,
    priceSlippage,
    entirePosition: params.entirePosition,
  });

  return { tx, positionPubkey: params.positionPubkey };
}

/**
 * Sign a transaction and submit it on-chain.
 * The keeper will automatically pick up the PositionRequest and execute the trade.
 */
export async function signAndSendPerps(
  connection: Connection,
  keypair: Keypair,
  tx: VersionedTransaction,
): Promise<string> {
  tx.sign([keypair]);
  return sendAndConfirmTransaction(connection, tx);
}

// ============================================================================
// TP/SL transaction building
// ============================================================================

export interface TpslParams {
  positionPubkey: string;
  side: PerpsSide;
  asset: PerpsAsset;
  receiveToken: PerpsToken;
  tpPrice?: number;  // take-profit trigger price in USD
  slPrice?: number;  // stop-loss trigger price in USD
  entirePosition?: boolean;
}

/**
 * Build a TP/SL transaction. If both tp and sl are provided, bundles both into one tx.
 */
export async function buildTpslTransaction(
  connection: Connection,
  params: TpslParams,
): Promise<{ tx: VersionedTransaction; positionPubkey: string }> {
  const positionPubkey = new PublicKey(params.positionPubkey);
  const entirePosition = params.entirePosition ?? true;

  // For longs: TP triggers above (price >= tp), SL triggers below (price <= sl)
  // For shorts: TP triggers below (price <= tp), SL triggers above (price >= sl)
  const isLong = params.side === 'long';

  const makeReq = (price: number, isTP: boolean) => ({
    owner: positionPubkey, // unused — fetched from position account
    positionPubkey,
    desiredToken: params.receiveToken,
    triggerPrice: new BN(Math.round(price * 1_000_000)),
    triggerAboveThreshold: isLong ? isTP : !isTP,
    entirePosition,
  });

  let tx: VersionedTransaction;

  if (params.tpPrice && params.slPrice) {
    tx = await buildTpslPairTx(
      connection,
      makeReq(params.tpPrice, true),
      makeReq(params.slPrice, false),
    );
  } else if (params.tpPrice) {
    tx = await buildTpslTx(connection, makeReq(params.tpPrice, true));
  } else if (params.slPrice) {
    tx = await buildTpslTx(connection, makeReq(params.slPrice, false));
  } else {
    throw new Error('At least one of --tp or --sl is required');
  }

  return { tx, positionPubkey: params.positionPubkey };
}

// Legacy compat — kept for any code still using the old flow
export async function signAndExecutePerps(
  connection: Connection,
  keypair: Keypair,
  txBase64: string,
  _action: string,
): Promise<string> {
  const transaction = VersionedTransaction.deserialize(Buffer.from(txBase64, 'base64'));
  transaction.sign([keypair]);
  return sendAndConfirmTransaction(connection, transaction);
}

// ============================================================================
// Helpers
// ============================================================================

/** Convert raw 6-decimal USD string to human-readable number */
export function rawToUsd(raw: string | number): number {
  return Number(raw) / 1_000_000;
}

/** Convert raw 6-decimal USD string to formatted dollar string */
export function formatUsd(raw: string | number): string {
  const usd = rawToUsd(raw);
  return `$${usd.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/** Resolve asset name to mint */
export function assetToMint(asset: string): string {
  const upper = asset.toUpperCase();
  const mint = PERPS_MINTS[upper];
  if (!mint) throw new Error(`Unknown perps asset: ${asset}. Available: ${PERPS_ASSETS.join(', ')}`);
  return mint;
}

/** Token decimals for perps input tokens */
export function perpsTokenDecimals(token: PerpsToken): number {
  switch (token) {
    case 'SOL': return 9;
    case 'ETH': return 8;
    case 'BTC': return 8;
    case 'USDC': return 6;
  }
}
