import { Connection, Keypair, VersionedTransaction } from '@solana/web3.js';
import Big from 'big.js';
import { apis, tokens, requireJupiterKey } from '../config.js';
import { sendAndConfirmTransaction } from './solana.js';

// Micro USD conversion (6 decimals)
const MICRO_USD = new Big(1_000_000);

interface PredictionEvent {
  eventId: string;
  isActive: boolean;
  isLive: boolean;
  category: string;
  subcategory?: string;
  tags: string[];
  metadata: {
    title: string;
    subtitle?: string;
    slug?: string;
    series?: string;
    imageUrl?: string;
    closeTime?: string;
  };
  volumeUsd?: string;
  beginAt?: string;
  closeCondition?: string;
  markets: PredictionMarket[];
}

interface PredictionMarket {
  marketId: string;
  status: 'open' | 'closed';
  result: 'yes' | 'no' | null;
  openTime: number;
  closeTime: number;
  metadata: {
    title: string;
    rulesPrimary?: string;
    rulesSecondary?: string;
  };
  pricing: {
    buyYesPriceUsd: number;  // in micro USD (1,000,000 = $1)
    sellYesPriceUsd: number;
    buyNoPriceUsd: number;
    sellNoPriceUsd: number;
    volume?: number;
  };
}

interface PredictionPosition {
  pubkey: string;
  owner: string;
  ownerPubkey: string;
  market: string;
  marketId: string;
  eventId: string;
  isYes: boolean;
  contracts: string;           // API returns string
  totalCostUsd: string;        // in micro USD
  avgPriceUsd: string;         // in micro USD
  valueUsd: string;            // in micro USD
  markPriceUsd: string;        // in micro USD
  sellPriceUsd: string;        // in micro USD
  pnlUsd: string;              // in micro USD
  pnlUsdPercent: number;
  pnlUsdAfterFees: string;     // in micro USD
  pnlUsdAfterFeesPercent: number;
  feesPaidUsd: string;         // in micro USD
  claimable: boolean;
  claimed: boolean;
  payoutUsd: string;           // in micro USD
  eventMetadata: {
    title: string;
    category: string;
  };
  marketMetadata: {
    title: string;
    status: string;
    result: 'yes' | 'no' | null;
  };
}

interface OrderResponse {
  transaction: string; // Base64 encoded
  txMeta?: {
    blockhash: string;
    lastValidBlockHeight: number;
  };
}

function getApiKey(): string {
  return requireJupiterKey();
}

async function predictionFetch<T>(path: string, options?: RequestInit): Promise<T> {
  const response = await fetch(`${apis.jupiterPrediction}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': getApiKey(),
      ...options?.headers,
    },
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Prediction API error (${response.status}): ${errorText}`);
  }

  return response.json() as Promise<T>;
}

/**
 * List prediction events with optional filters
 */
export async function listEvents(options?: {
  category?: string;
  status?: string;
  limit?: number;
  offset?: number;
}): Promise<{ events: PredictionEvent[]; total: number }> {
  const params = new URLSearchParams();
  if (options?.category) params.append('category', options.category);
  if (options?.status) params.append('status', options.status);
  if (options?.limit) params.append('limit', options.limit.toString());
  if (options?.offset) params.append('offset', options.offset.toString());

  const query = params.toString() ? `?${params.toString()}` : '';
  const response = await predictionFetch<{ data: PredictionEvent[]; total?: number }>(`/events${query}`);
  return { events: response.data || [], total: response.total || response.data?.length || 0 };
}

/**
 * Search events by keyword
 */
export async function searchEvents(query: string): Promise<{ events: PredictionEvent[] }> {
  const response = await predictionFetch<{ data: PredictionEvent[] }>(`/events/search?query=${encodeURIComponent(query)}`);
  return { events: response.data || [] };
}

/**
 * Get market details with pricing
 */
export async function getMarket(marketId: string): Promise<PredictionMarket> {
  // Single market endpoint returns data directly, not wrapped
  return predictionFetch<PredictionMarket>(`/markets/${marketId}`);
}

/**
 * Get user positions
 */
export async function getPositions(ownerPubkey: string, options?: {
  status?: 'open' | 'claimable' | 'all';
}): Promise<{ positions: PredictionPosition[] }> {
  const params = new URLSearchParams();
  params.append('ownerPubkey', ownerPubkey);
  if (options?.status) params.append('status', options.status);

  const response = await predictionFetch<{ data: PredictionPosition[] }>(`/positions?${params.toString()}`);
  return { positions: response.data || [] };
}

interface CreateOrderResponse {
  transaction: string;
  txMeta: {
    blockhash: string;
    lastValidBlockHeight: number;
  };
  externalOrderId: string;
  order: {
    orderPubkey: string;
    marketId: string;
    isBuy: boolean;
    isYes: boolean;
    contracts: string;
    maxBuyPriceUsd: string | null;
    orderCostUsd: string;
    newAvgPriceUsd: string;
    estimatedTotalFeeUsd: string;
  };
}

/**
 * Create a buy order for YES or NO contracts
 * @param amountUsd - Amount in USD to spend (e.g., 5 for $5)
 */
export async function createOrder(params: {
  ownerPubkey: string;
  marketId: string;
  isYes: boolean;
  amountUsd: number | string; // Amount in USD to spend
}): Promise<CreateOrderResponse> {
  const { ownerPubkey, marketId, isYes, amountUsd } = params;

  // Convert USD to micro USD (6 decimals) - USDC has 6 decimals
  const depositAmount = new Big(amountUsd).times(MICRO_USD).round(0, Big.roundDown).toString();

  return predictionFetch('/orders', {
    method: 'POST',
    body: JSON.stringify({
      ownerPubkey,
      marketId,
      isYes,
      isBuy: true,
      depositAmount,
      depositMint: tokens.USDC,
    }),
  });
}

/**
 * Create a sell order to close position (partial)
 */
export async function createSellOrder(params: {
  ownerPubkey: string;
  marketId: string;
  isYes: boolean;
  contracts: number;
  minSellPriceUsd?: number; // Optional limit price (e.g., 0.15 for 15 cents)
}): Promise<OrderResponse> {
  const { ownerPubkey, marketId, isYes, contracts, minSellPriceUsd } = params;

  const body: Record<string, unknown> = {
    ownerPubkey,
    marketId,
    isYes,
    isBuy: false,
    contracts,
  };

  // Add min sell price if specified (convert to micro USD)
  if (minSellPriceUsd !== undefined) {
    body.minSellPriceUsd = new Big(minSellPriceUsd).times(MICRO_USD).round(0).toString();
  }

  return predictionFetch('/orders', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

/**
 * Close entire prediction position using DELETE endpoint
 */
export async function closePredictionOrder(params: {
  ownerPubkey: string;
  positionPubkey: string;
}): Promise<OrderResponse> {
  const { ownerPubkey, positionPubkey } = params;

  return predictionFetch(`/positions/${positionPubkey}`, {
    method: 'DELETE',
    body: JSON.stringify({ ownerPubkey }),
  });
}

/**
 * Sign and execute a prediction order
 */
export async function executeOrder(
  connection: Connection,
  keypair: Keypair,
  orderResponse: OrderResponse | CreateOrderResponse
): Promise<string> {
  const { transaction: txBase64 } = orderResponse;

  // Deserialize and sign
  const transaction = VersionedTransaction.deserialize(Buffer.from(txBase64, 'base64'));
  transaction.sign([keypair]);

  // Send and confirm using enhanced utility
  return sendAndConfirmTransaction(connection, transaction);
}

/**
 * Claim winnings from a resolved position
 */
export async function createClaimOrder(params: {
  ownerPubkey: string;
  positionPubkey: string;
}): Promise<OrderResponse> {
  return predictionFetch(`/positions/${params.positionPubkey}/claim`, {
    method: 'POST',
    body: JSON.stringify({
      ownerPubkey: params.ownerPubkey,
    }),
  });
}

/**
 * Convert micro USD to USD
 * Handles empty strings and invalid values gracefully
 */
export function microToUsd(microUsd: number | string | null | undefined): Big {
  if (microUsd === null || microUsd === undefined || microUsd === '') {
    return new Big(0);
  }
  return new Big(microUsd).div(MICRO_USD);
}

