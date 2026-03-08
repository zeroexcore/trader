import { Connection, Keypair, VersionedTransaction } from '@solana/web3.js';
import { apis, requireJupiterKey } from '../config.js';

// ============================================================================
// Types
// ============================================================================

export interface TriggerOrderParams {
  makingAmount: string;
  takingAmount: string;
  slippageBps?: string;
  expiredAt?: string;
}

export interface CreateOrderRequest {
  inputMint: string;
  outputMint: string;
  maker: string;
  payer: string;
  params: TriggerOrderParams;
  computeUnitPrice: string;
}

export interface CreateOrderResponse {
  order: string;
  transaction: string;
  requestId: string;
}

export interface ExecuteRequest {
  signedTransaction: string;
  requestId: string;
}

export interface CancelOrderRequest {
  maker: string;
  computeUnitPrice: string;
  order: string;
}

export interface CancelOrderResponse {
  transaction: string;
  requestId: string;
}

export interface CancelOrdersRequest {
  maker: string;
  computeUnitPrice: string;
  orders: string[];
}

export interface CancelOrdersResponse {
  transactions: string[];
  requestId: string;
}

export interface TriggerOrder {
  orderKey: string;
  maker: string;
  inputMint: string;
  outputMint: string;
  makingAmount: string;
  takingAmount: string;
  remainingMakingAmount: string;
  remainingTakingAmount: string;
  expiredAt: string | null;
  createdAt: string;
  updatedAt: string;
  status: string;
}

export interface GetTriggerOrdersResponse {
  orders: TriggerOrder[];
  page: number;
  totalPages: number;
  count: number;
}

// ============================================================================
// API Client
// ============================================================================

async function triggerFetch<T>(path: string, options?: RequestInit): Promise<T> {
  const apiKey = requireJupiterKey();
  const response = await fetch(`${apis.jupiterTrigger}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      ...options?.headers,
    },
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Trigger API error (${response.status}): ${errorText}`);
  }

  return response.json() as Promise<T>;
}

/** Create a limit order */
export async function createLimitOrder(params: {
  inputMint: string;
  outputMint: string;
  maker: string;
  makingAmount: string;
  takingAmount: string;
  expiredAt?: string;
}): Promise<CreateOrderResponse> {
  const body: CreateOrderRequest = {
    inputMint: params.inputMint,
    outputMint: params.outputMint,
    maker: params.maker,
    payer: params.maker,
    params: {
      makingAmount: params.makingAmount,
      takingAmount: params.takingAmount,
    },
    computeUnitPrice: 'auto',
  };

  if (params.expiredAt) {
    body.params.expiredAt = params.expiredAt;
  }

  return triggerFetch<CreateOrderResponse>('/createOrder', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

/** Cancel a single limit order */
export async function cancelLimitOrder(params: {
  maker: string;
  order: string;
}): Promise<CancelOrderResponse> {
  return triggerFetch<CancelOrderResponse>('/cancelOrder', {
    method: 'POST',
    body: JSON.stringify({
      maker: params.maker,
      computeUnitPrice: 'auto',
      order: params.order,
    }),
  });
}

/** Cancel multiple limit orders. WARNING: empty array cancels ALL orders. */
export async function cancelLimitOrders(params: {
  maker: string;
  orders: string[];
}): Promise<CancelOrdersResponse> {
  return triggerFetch<CancelOrdersResponse>('/cancelOrders', {
    method: 'POST',
    body: JSON.stringify({
      maker: params.maker,
      computeUnitPrice: 'auto',
      orders: params.orders,
    }),
  });
}

/** Execute a signed trigger transaction */
export async function executeTriggerTransaction(
  signedTransaction: string,
  requestId: string,
): Promise<void> {
  await triggerFetch<unknown>('/execute', {
    method: 'POST',
    body: JSON.stringify({ signedTransaction, requestId }),
  });
}

/** List trigger orders for a user */
export async function getTriggerOrders(
  user: string,
  status: 'active' | 'history' = 'active',
): Promise<GetTriggerOrdersResponse> {
  const params = new URLSearchParams({ user, orderStatus: status });
  return triggerFetch<GetTriggerOrdersResponse>(`/getTriggerOrders?${params.toString()}`);
}

/** Deserialize, sign, and execute a trigger transaction via /execute */
export async function signAndExecuteTrigger(
  _connection: Connection,
  keypair: Keypair,
  txBase64: string,
  requestId: string,
): Promise<string> {
  const transaction = VersionedTransaction.deserialize(Buffer.from(txBase64, 'base64'));
  transaction.sign([keypair]);

  const signedBase64 = Buffer.from(transaction.serialize()).toString('base64');
  await executeTriggerTransaction(signedBase64, requestId);

  // Return the transaction signature (first signature from the signed tx)
  const sig = transaction.signatures[0];
  const bs58Chars = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
  return encodeBase58(sig);
}

/** Encode bytes to base58 */
function encodeBase58(bytes: Uint8Array): string {
  const bs58Chars = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
  let result = '';
  let nums = Array.from(bytes);

  while (nums.length) {
    let carry = 0;
    const next: number[] = [];
    for (const byte of nums) {
      carry = carry * 256 + byte;
      if (next.length || carry >= 58) {
        next.push(Math.floor(carry / 58));
        carry %= 58;
      }
    }
    result = bs58Chars[carry] + result;
    nums = next;
  }

  for (const byte of bytes) {
    if (byte === 0) result = '1' + result;
    else break;
  }

  return result;
}
