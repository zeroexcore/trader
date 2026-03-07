import { requireHeliusKey, apis, tokens } from '../config.js';

interface TokenBalance {
  name: string;
  symbol: string;
  mint: string;
  balance: number;
  decimals: number;
  valueUsd: number;
  pricePerToken: number;
}

interface PortfolioData {
  totalValueUsd: number;
  tokens: TokenBalance[];
}

/**
 * Fetch portfolio using Helius DAS API
 */
export async function getPortfolio(address: string): Promise<PortfolioData> {
  const heliusApiKey = requireHeliusKey();
  const url = apis.heliusRpc(heliusApiKey);
  
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

  const tokenBalances: TokenBalance[] = [];
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
              id: tokens.SOL,
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

      tokenBalances.push({
        name: 'Solana',
        symbol: 'SOL',
        mint: tokens.SOL,
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
          const quoteUrl = new URL(apis.jupiterQuote);
          quoteUrl.searchParams.append('inputMint', asset.id);
          quoteUrl.searchParams.append('outputMint', tokens.USDC);
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

      tokenBalances.push({
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
  tokenBalances.sort((a, b) => b.valueUsd - a.valueUsd);

  return {
    totalValueUsd,
    tokens: tokenBalances,
  };
}

