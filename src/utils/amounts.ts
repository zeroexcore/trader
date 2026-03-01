import Big from 'big.js';

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
 * Safe multiplication for token amounts
 */
export function multiplyAmounts(amount1: string | number, amount2: string | number): string {
  const big1 = new Big(amount1);
  const big2 = new Big(amount2);
  return big1.times(big2).toFixed();
}

/**
 * Safe division for token amounts
 */
export function divideAmounts(amount1: string | number, amount2: string | number): string {
  const big1 = new Big(amount1);
  const big2 = new Big(amount2);
  return big1.div(big2).toFixed();
}

/**
 * Safe addition for token amounts
 */
export function addAmounts(amount1: string | number, amount2: string | number): string {
  const big1 = new Big(amount1);
  const big2 = new Big(amount2);
  return big1.plus(big2).toFixed();
}

/**
 * Safe subtraction for token amounts
 */
export function subtractAmounts(amount1: string | number, amount2: string | number): string {
  const big1 = new Big(amount1);
  const big2 = new Big(amount2);
  return big1.minus(big2).toFixed();
}

/**
 * Get token decimals from Helius or cache
 */
export async function getTokenDecimals(mintAddress: string): Promise<number> {
  const heliusApiKey = process.env.HELIUS_API_KEY;
  if (!heliusApiKey) {
    throw new Error('HELIUS_API_KEY not set');
  }

  // Special case for native SOL
  if (mintAddress === 'So11111111111111111111111111111111111111112') {
    return 9;
  }

  // Common tokens cache to avoid API calls
  const commonDecimals: Record<string, number> = {
    'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v': 6, // USDC
    'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB': 6, // USDT
    'So11111111111111111111111111111111111111112': 9, // SOL
  };

  if (commonDecimals[mintAddress]) {
    return commonDecimals[mintAddress];
  }

  // Fetch from Helius DAS API
  try {
    const url = `https://mainnet.helius-rpc.com/?api-key=${heliusApiKey}`;
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
  } catch (error) {
    console.warn('Failed to fetch decimals from Helius, defaulting to 9');
  }

  // Default to 9 if we can't fetch (most SPL tokens use 9)
  return 9;
}
