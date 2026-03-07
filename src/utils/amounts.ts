import Big from 'big.js';
import { requireHeliusKey, apis, tokens, getDecimalsFromCache } from '../config.js';

/**
 * Convert human-readable amount to smallest unit (with decimals)
 * Uses Big.js for precision - safe for large numbers and financial calculations
 * 
 * Examples:
 *   toSmallestUnit(1, 9) = "1000000000" (1 SOL)
 *   toSmallestUnit(100, 6) = "100000000" (100 USDC)
 *   toSmallestUnit(0.000001, 9) = "1000" (0.000001 SOL)
 */
export function toSmallestUnit(amount: number | string, decimals: number): string {
  try {
    const bigAmount = new Big(amount);
    const multiplier = new Big(10).pow(decimals);
    const result = bigAmount.times(multiplier);
    
    // Return as integer string (no decimals in smallest unit)
    return result.round(0, Big.roundDown).toFixed(0);
  } catch (error) {
    throw new Error(`Invalid amount for conversion: ${amount}`);
  }
}

/**
 * Convert smallest unit to human-readable amount
 * Uses Big.js for precision
 * 
 * Examples:
 *   fromSmallestUnit('1000000000', 9) = "1" (1 SOL)
 *   fromSmallestUnit('100000000', 6) = "100" (100 USDC)
 */
export function fromSmallestUnit(amount: string, decimals: number): string {
  try {
    const bigAmount = new Big(amount);
    const divisor = new Big(10).pow(decimals);
    const result = bigAmount.div(divisor);
    
    return result.toFixed(); // Returns string with appropriate precision
  } catch (error) {
    throw new Error(`Invalid amount for conversion: ${amount}`);
  }
}

/**
 * Get token decimals from Helius or cache
 */
export async function getTokenDecimals(mintAddress: string): Promise<number> {
  const heliusApiKey = requireHeliusKey();

  // Special case for native SOL
  if (mintAddress === tokens.SOL) {
    return 9;
  }

  // Check centralized cache first
  const cached = getDecimalsFromCache(mintAddress);
  if (cached !== undefined) {
    return cached;
  }

  // Fetch from Helius DAS API
  try {
    const url = apis.heliusRpc(heliusApiKey);
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 'decimals',
        method: 'getAsset',
        params: { id: mintAddress },
      }),
    });

    const { result } = await response.json() as any;
    
    if (result?.token_info?.decimals !== undefined) {
      return result.token_info.decimals;
    }
  } catch {
    // Fall through to error
  }

  throw new Error(
    `Failed to fetch token decimals for ${mintAddress}. ` +
    `Cannot proceed safely — incorrect decimals could cause wrong swap amounts.`
  );
}
