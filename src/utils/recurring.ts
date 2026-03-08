import { Connection, Keypair, VersionedTransaction } from '@solana/web3.js';
import { apis, requireJupiterKey } from '../config.js';

// ============================================================================
// Types
// ============================================================================

export interface CreateDcaOrderParams {
  user: string;
  inputMint: string;
  outputMint: string;
  params: {
    time: {
      inAmount: number;
      numberOfOrders: number;
      interval: number;
      minPrice?: number | null;
      maxPrice?: number | null;
      startAt?: number | null;
    };
  };
}

export interface CreateDcaOrderResponse {
  requestId: string;
  transaction: string; // base64 encoded
}

export interface CancelDcaOrderParams {
  order: string;
  user: string;
  recurringType: 'time';
}

export interface CancelDcaOrderResponse {
  requestId: string;
  transaction: string; // base64 encoded
}

export interface ExecuteDcaResponse {
  signature?: string;
  status?: string;
}

export interface RecurringOrder {
  orderKey: string;
  userPubkey: string;
  inputMint: string;
  outputMint: string;
  inDeposited: string;
  inWithdrawn: string;
  rawInDeposited: string;
  rawInWithdrawn: string;
  cycleFrequency: string;
  outWithdrawn: string;
  inAmountPerCycle: string;
  minOutAmount: string;
  maxOutAmount: string;
  inUsed: string;
  outReceived: string;
  createdAt: string;
  updatedAt?: string;
  closedAt?: string;
  // Computed for convenience
  numberOfOrdersFilled?: number;
  numberOfOrdersToFill?: number;
}

export interface RecurringOrdersResponse {
  orders: RecurringOrder[];
}

// ============================================================================
// API Client
// ============================================================================

async function recurringFetch<T>(path: string, options?: RequestInit): Promise<T> {
  const response = await fetch(`${apis.jupiterRecurring}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': requireJupiterKey(),
      ...options?.headers,
    },
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Jupiter Recurring API error (${response.status}): ${errorText}`);
  }

  return response.json() as Promise<T>;
}

/**
 * Create a time-based DCA order
 */
export async function createDcaOrder(params: CreateDcaOrderParams): Promise<CreateDcaOrderResponse> {
  return recurringFetch<CreateDcaOrderResponse>('/createOrder', {
    method: 'POST',
    body: JSON.stringify(params),
  });
}

/**
 * Cancel an active DCA order
 */
export async function cancelDcaOrder(params: CancelDcaOrderParams): Promise<CancelDcaOrderResponse> {
  return recurringFetch<CancelDcaOrderResponse>('/cancelOrder', {
    method: 'POST',
    body: JSON.stringify(params),
  });
}

/**
 * Post a signed transaction to the /execute endpoint
 */
export async function executeDcaTransaction(
  signedTransaction: string,
  requestId: string,
): Promise<ExecuteDcaResponse> {
  return recurringFetch<ExecuteDcaResponse>('/execute', {
    method: 'POST',
    body: JSON.stringify({ signedTransaction, requestId }),
  });
}

/**
 * List recurring orders for a user
 */
export async function getRecurringOrders(
  user: string,
  orderStatus: 'active' | 'history' = 'active',
  recurringType: string = 'time',
  page: number = 1,
): Promise<RecurringOrdersResponse> {
  const params = new URLSearchParams({
    user,
    orderStatus,
    recurringType,
    page: page.toString(),
    includeFailedTx: 'false',
  });
  // API returns { user, orderStatus, time: [...] } not { orders: [...] }
  const raw = await recurringFetch<Record<string, unknown>>(`/getRecurringOrders?${params.toString()}`);
  const orders = (raw.time as RecurringOrder[] | undefined) || [];
  return { orders };
}

/**
 * Deserialize, sign, and post a DCA transaction via /execute
 */
export async function signAndExecuteDca(
  _connection: Connection,
  keypair: Keypair,
  txBase64: string,
  requestId: string,
): Promise<ExecuteDcaResponse> {
  const transaction = VersionedTransaction.deserialize(Buffer.from(txBase64, 'base64'));
  transaction.sign([keypair]);

  const signedTx = Buffer.from(transaction.serialize()).toString('base64');
  return executeDcaTransaction(signedTx, requestId);
}
