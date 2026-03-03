import { Connection, Keypair, VersionedTransaction } from '@solana/web3.js';
import Big from 'big.js';

// Jupiter Prediction Market API v1
const PREDICTION_API = 'https://api.jup.ag/prediction/v1';

// USDC mint for deposits
const USDC_MINT = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';

// Micro USD conversion (6 decimals)
const MICRO_USD = new Big(1_000_000);

export interface PredictionEvent {
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

export interface PredictionMarket {
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

export interface PredictionPosition {
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

export interface OrderResponse {
  transaction: string; // Base64 encoded
  txMeta?: {
    blockhash: string;
    lastValidBlockHeight: number;
  };
}

function getApiKey(): string {
  const key = process.env.JUPITER_API_KEY;
  if (!key) {
    throw new Error('JUPITER_API_KEY not set. Get key at https://portal.jup.ag');
  }
  return key;
}

async function predictionFetch<T>(path: string, options?: RequestInit): Promise<T> {
  const response = await fetch(`${PREDICTION_API}${path}`, {
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
 * Get single event details
 */
export async function getEvent(eventId: string): Promise<PredictionEvent> {
  // Single event endpoint returns data directly, not wrapped
  return predictionFetch<PredictionEvent>(`/events/${eventId}`);
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

export interface CreateOrderResponse {
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
      depositMint: USDC_MINT,
    }),
  });
}

/**
 * Create a sell order to close position
 */
export async function createSellOrder(params: {
  ownerPubkey: string;
  marketId: string;
  isYes: boolean;
  contracts: number;
}): Promise<OrderResponse> {
  const { ownerPubkey, marketId, isYes, contracts } = params;

  return predictionFetch('/orders', {
    method: 'POST',
    body: JSON.stringify({
      ownerPubkey,
      marketId,
      isYes,
      isBuy: false,
      contracts,
    }),
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

  // Send to Solana
  const signature = await connection.sendTransaction(transaction);

  // Wait for confirmation
  await connection.confirmTransaction(signature, 'confirmed');

  return signature;
}

/**
 * Claim winnings from a resolved position
 */
export async function createClaimOrder(params: {
  ownerPubkey: string;
  positionPubkey: string;
}): Promise<OrderResponse> {
  return predictionFetch('/claim', {
    method: 'POST',
    body: JSON.stringify(params),
  });
}

/**
 * Convert micro USD to USD
 */
export function microToUsd(microUsd: number | string): Big {
  return new Big(microUsd).div(MICRO_USD);
}

/**
 * Convert USD to micro USD
 */
export function usdToMicro(usd: number | string): Big {
  return new Big(usd).times(MICRO_USD);
}

/**
 * Format price from micro USD to display
 */
export function formatPrice(microUsd: number | string): string {
  return `$${microToUsd(microUsd).toFixed(2)}`;
}

/**
 * Format price as percentage (since $1 = 100%)
 */
export function priceToPercent(microUsd: number | string): string {
  return `${microToUsd(microUsd).times(100).toFixed(1)}%`;
}

/**
 * Get market status summary
 */
export async function getMarketStatus(): Promise<{
  isOpen: boolean;
  message?: string;
}> {
  try {
    const response = await predictionFetch<{ status: string }>('/status');
    return { isOpen: response.status === 'open' };
  } catch (error) {
    return { isOpen: false, message: 'Unable to reach prediction market API' };
  }
}
