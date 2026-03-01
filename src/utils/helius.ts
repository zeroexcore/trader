import { PublicKey } from '@solana/web3.js';

export interface TokenBalance {
  name: string;
  symbol: string;
  mint: string;
  balance: number;
  decimals: number;
  valueUsd: number;
  pricePerToken: number;
}

export interface PortfolioData {
  totalValueUsd: number;
  tokens: TokenBalance[];
}

/**
 * Fetch portfolio using Helius DAS API
 */
export async function getPortfolio(address: string): Promise<PortfolioData> {
  const heliusApiKey = process.env.HELIUS_API_KEY;
  if (!heliusApiKey) {
    throw new Error('HELIUS_API_KEY not set in environment');
  }

  const url = `https://mainnet.helius-rpc.com/?api-key=${heliusApiKey}`;
  
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 'portfolio-fetch',
      method: 'getAssetsByOwner',
      params: {
        ownerAddress: address,
        displayOptions: {
          showFungible: true,
          showNativeBalance: true,
        },
      },
    }),
  });

  const data = await response.json() as any;
  
  if (data.error) {
    throw new Error(`Helius API error: ${data.error.message}`);
  }

  const tokens: TokenBalance[] = [];
  let totalValueUsd = 0;

  // Get native SOL balance separately using getBalance RPC call
  try {
    const solBalanceResponse = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 'sol-balance',
        method: 'getBalance',
        params: [address],
      }),
    });

    const solData = await solBalanceResponse.json() as any;
    
    if (solData.result && solData.result.value > 0) {
      const solBalance = solData.result.value / 1e9; // Convert lamports to SOL
      
      // Get SOL price from Helius DAS API (same as wSOL)
      // SOL/wSOL are the same token, DAS API provides USDC price
      let solPrice = 0;
      try {
        const solPriceResponse = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            jsonrpc: '2.0',
            id: 'sol-price',
            method: 'getAsset',
            params: {
              id: 'So11111111111111111111111111111111111111112',
            },
          }),
        });

        const solPriceData = await solPriceResponse.json() as any;
        
        if (solPriceData.result?.token_info?.price_info?.price_per_token) {
          solPrice = solPriceData.result.token_info.price_info.price_per_token;
        }
      } catch (e) {
        console.warn('Unable to fetch SOL price from Helius DAS API');
        solPrice = 0;
      }

      const solValueUsd = solBalance * solPrice;

      tokens.push({
        name: 'Solana',
        symbol: 'SOL',
        mint: 'So11111111111111111111111111111111111111112',
        balance: solBalance,
        decimals: 9,
        valueUsd: solValueUsd,
        pricePerToken: solPrice,
      });

      totalValueUsd += solValueUsd;
    }
  } catch (error) {
    console.error('Error fetching SOL balance:', error);
  }

  // Process fungible tokens (SPL tokens)
  for (const asset of data.result?.items || []) {
    if (asset.interface === 'FungibleToken' || asset.interface === 'FungibleAsset') {
      const balance = asset.token_info?.balance || 0;
      const decimals = asset.token_info?.decimals || 0;
      const normalizedBalance = balance / Math.pow(10, decimals);
      let pricePerToken = asset.token_info?.price_info?.price_per_token || 0;
      
      // If Helius doesn't have price, try Jupiter quote vs USDC
      if (pricePerToken === 0 && normalizedBalance > 0) {
        try {
          const quoteUrl = new URL('https://quote-api.jup.ag/v6/quote');
          quoteUrl.searchParams.append('inputMint', asset.id);
          quoteUrl.searchParams.append('outputMint', 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v'); // USDC
          quoteUrl.searchParams.append('amount', Math.pow(10, decimals).toString()); // 1 token
          
          const quoteResponse = await fetch(quoteUrl.toString());
          const quoteData = await quoteResponse.json() as any;
          
          if (quoteData.outAmount) {
            pricePerToken = parseFloat(quoteData.outAmount) / 1e6; // USDC has 6 decimals
          }
        } catch (e) {
          // Silently fail, keep price as 0
        }
      }
      
      const valueUsd = normalizedBalance * pricePerToken;

      tokens.push({
        name: asset.content?.metadata?.name || 'Unknown',
        symbol: asset.content?.metadata?.symbol || '???',
        mint: asset.id,
        balance: normalizedBalance,
        decimals,
        valueUsd,
        pricePerToken,
      });

      totalValueUsd += valueUsd;
    }
  }

  // Sort by USD value descending
  tokens.sort((a, b) => b.valueUsd - a.valueUsd);

  return {
    totalValueUsd,
    tokens,
  };
}

/**
 * Get transaction history for PnL calculation
 */
export async function getTransactionHistory(
  address: string,
  mint?: string
): Promise<any[]> {
  const heliusApiKey = process.env.HELIUS_API_KEY;
  if (!heliusApiKey) {
    throw new Error('HELIUS_API_KEY not set in environment');
  }

  const url = `https://api.helius.xyz/v0/addresses/${address}/transactions?api-key=${heliusApiKey}`;
  
  const response = await fetch(url);
  const transactions = await response.json() as any[];

  // Filter by mint if provided
  if (mint) {
    return transactions.filter((tx: any) => {
      return tx.tokenTransfers?.some((t: any) => t.mint === mint);
    });
  }

  return transactions;
}

/**
 * Calculate PnL for a specific token
 */
export async function calculatePnL(address: string, mint: string) {
  const heliusApiKey = process.env.HELIUS_API_KEY;
  if (!heliusApiKey) {
    throw new Error('HELIUS_API_KEY not set in environment');
  }

  const url = `https://api.helius.xyz/v0/addresses/${address}/transactions?api-key=${heliusApiKey}`;
  const response = await fetch(url);
  const transactions = await response.json() as any[];
  
  let totalBought = 0;
  let totalCostBasis = 0;
  let totalSold = 0;
  let totalRevenue = 0;

  // Special handling for native SOL
  const isNativeSOL = mint === 'So11111111111111111111111111111111111111112';

  for (const tx of transactions) {
    if (isNativeSOL) {
      // Process native SOL transfers
      for (const transfer of tx.nativeTransfers || []) {
        const amount = transfer.amount / 1e9; // Convert lamports to SOL
        
        // Get SOL price at the time of the transaction
        let priceAtTime = 0;
        try {
          // In production, you'd fetch historical price. For now, use current price as estimate
          const solPriceUrl = `https://mainnet.helius-rpc.com/?api-key=${heliusApiKey}`;
          const priceResponse = await fetch(solPriceUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              jsonrpc: '2.0',
              id: 'price',
              method: 'getAsset',
              params: { id: mint },
            }),
          });
          const priceData = await priceResponse.json() as any;
          priceAtTime = priceData.result?.token_info?.price_info?.price_per_token || 0;
        } catch (e) {
          priceAtTime = 0;
        }

        const usdValue = amount * priceAtTime;

        if (transfer.fromUserAccount === address) {
          // Outgoing (sell/spend)
          totalSold += amount;
          totalRevenue += usdValue;
        } else if (transfer.toUserAccount === address) {
          // Incoming (buy/receive)
          totalBought += amount;
          totalCostBasis += usdValue;
        }
      }
    } else {
      // Process SPL token transfers
      for (const transfer of tx.tokenTransfers || []) {
        if (transfer.mint !== mint) continue;

        const amount = transfer.tokenAmount;
        const usdValue = transfer.tokenAmount * (transfer.pricePerToken || 0);

        if (transfer.fromUserAccount === address) {
          // Sell
          totalSold += amount;
          totalRevenue += usdValue;
        } else if (transfer.toUserAccount === address) {
          // Buy
          totalBought += amount;
          totalCostBasis += usdValue;
        }
      }
    }
  }

  // Current holdings
  const portfolio = await getPortfolio(address);
  const currentHolding = portfolio.tokens.find(t => t.mint === mint);
  const currentValue = currentHolding?.valueUsd || 0;
  const currentPrice = currentHolding?.pricePerToken || 0;

  // Realized PnL (from sells)
  const realizedPnL = totalBought > 0 
    ? totalRevenue - (totalCostBasis * (totalSold / totalBought))
    : 0;
  
  // Unrealized PnL (current holdings)
  const remainingCostBasis = totalBought > 0
    ? totalCostBasis - (totalCostBasis * (totalSold / totalBought))
    : 0;
  const unrealizedPnL = currentValue - remainingCostBasis;

  // Calculate average purchase price
  const avgPurchasePrice = totalBought > 0 ? totalCostBasis / totalBought : 0;
  const priceChange = avgPurchasePrice > 0 
    ? ((currentPrice - avgPurchasePrice) / avgPurchasePrice) * 100 
    : 0;

  return {
    mint,
    totalBought,
    totalSold,
    currentHolding: currentHolding?.balance || 0,
    costBasis: totalCostBasis,
    avgPurchasePrice,
    currentPrice,
    priceChange,
    currentValue,
    realizedPnL,
    unrealizedPnL,
    totalPnL: realizedPnL + unrealizedPnL,
  };
}
