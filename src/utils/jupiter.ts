import { Connection, Keypair, VersionedTransaction } from '@solana/web3.js';
import { apis, tokens, requireJupiterKey } from '../config.js';

export interface SwapParams {
  inputMint: string;
  outputMint: string;
  amount: number;
  slippageBps?: number;
}

export interface SwapQuote {
  inputMint: string;
  outputMint: string;
  inAmount: string;
  outAmount: string;
  priceImpactPct: number;
  route: any;
  transaction?: string; // Base64 encoded transaction (Ultra API)
  requestId?: string; // Request ID for execution (Ultra API)
}

/**
 * Get swap order from Jupiter Ultra API v1
 */
export async function getSwapQuote(params: SwapParams & { taker?: string }): Promise<SwapQuote> {
  const { inputMint, outputMint, amount, slippageBps = 50, taker } = params;

  const jupiterApiKey = requireJupiterKey();

  const url = new URL(`${apis.jupiterUltra}/order`);
  url.searchParams.append('inputMint', inputMint);
  url.searchParams.append('outputMint', outputMint);
  url.searchParams.append('amount', amount.toString());
  url.searchParams.append('slippageBps', slippageBps.toString());

  // Add taker (wallet address) to get transaction included in response
  if (taker) {
    url.searchParams.append('taker', taker);
  }

  const response = await fetch(url.toString(), {
    headers: {
      'x-api-key': jupiterApiKey,
    },
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Jupiter API error (${response.status}): ${errorText}`);
  }

  const quote = await response.json() as any;

  if (quote.error) {
    throw new Error(`Jupiter quote error: ${quote.error}`);
  }

  return quote as SwapQuote;
}

/**
 * Execute swap via Jupiter Ultra API v1
 * Ultra handles transaction building, signing, sending, and confirmation
 */
export async function executeSwap(
  connection: Connection,
  keypair: Keypair,
  quote: SwapQuote,
  priorityFeeLamports?: number
): Promise<string> {
  const jupiterApiKey = requireJupiterKey();

  // Extract transaction from order response
  const transactionBase64 = quote.transaction;
  if (!transactionBase64) {
    throw new Error('No transaction in order response');
  }

  // Deserialize, sign, and re-serialize transaction
  const transaction = VersionedTransaction.deserialize(Buffer.from(transactionBase64, 'base64'));
  transaction.sign([keypair]);
  const signedTransaction = Buffer.from(transaction.serialize()).toString('base64');

  // Execute via Ultra API
  const executeResponse = await fetch(`${apis.jupiterUltra}/execute`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': jupiterApiKey,
    },
    body: JSON.stringify({
      signedTransaction,
      requestId: quote.requestId,
    }),
  });

  if (!executeResponse.ok) {
    const errorText = await executeResponse.text();
    throw new Error(`Execute error (${executeResponse.status}): ${errorText}`);
  }

  const result = await executeResponse.json() as any;

  // Check execution status
  if (result.status === 'Success') {
    console.log('✅ Swap executed successfully via Jupiter Ultra API');
    return result.signature;
  } else {
    throw new Error(`Swap failed: ${JSON.stringify(result)}`);
  }
}

/**
 * Get token list for reference
 */
export async function searchToken(query: string): Promise<any[]> {
  const response = await fetch(apis.jupiterTokenList);
  const tokens = await response.json() as any[];

  const searchLower = query.toLowerCase();
  return tokens.filter((t: any) =>
    t.symbol.toLowerCase().includes(searchLower) ||
    t.name.toLowerCase().includes(searchLower)
  ).slice(0, 10);
}

// Common token mints for quick reference
export const COMMON_TOKENS = {
  SOL: tokens.SOL,
  USDC: tokens.USDC,
  USDT: tokens.USDT,
};
