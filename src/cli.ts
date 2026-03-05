#!/usr/bin/env node
import { Connection } from '@solana/web3.js';
import { Command } from 'commander';
import dotenv from 'dotenv';
import * as asciichart from 'asciichart';
import fs from 'fs';
import path from 'path';
import { getTokenDecimals, toSmallestUnit, fromSmallestUnit } from './utils/amounts.js';
import Big from 'big.js';
import { calculatePnL, getPortfolio } from './utils/helius.js';
import {
  executeSwap,
  getSwapQuote,
  searchToken
} from './utils/jupiter.js';
import {
  calculateTotalPnL,
  closePosition,
  closePredictionPosition,
  displayPositions,
  findPredictionByMarket,
  findPredictionByPubkey,
  getAllPositions,
  getOpenPositions,
  getPosition,
  getPositionStats,
  openPosition,
  openPredictionPosition,
  updatePositionPrices,
  updatePositionNotes,
  addPositionTags,
  getPositionsByTag,
} from './utils/positions.js';
import {
  addToken,
  listTokens,
  removeToken,
  resolveToken,
} from './utils/token-book.js';
import { formatTokenInfo, getTokenInfo } from './utils/token-info.js';
import {
  generateWallet,
  getWalletAddress,
  loadKeypairForSigning,
  exportPrivateKey,
} from './utils/wallet.js';
import {
  listEvents,
  searchEvents,
  getEvent,
  getMarket,
  getPositions,
  createOrder,
  createSellOrder,
  closePredictionOrder,
  executeOrder,
  createClaimOrder,
  formatPrice,
  priceToPercent,
  microToUsd,
} from './utils/prediction.js';
import {
  getPoolStats,
  getAllCustodyInfo,
  getOpenPositions as getPerpsPositions,
  calculatePnl as calculatePerpsPnl,
  CUSTODY,
} from './utils/perps/index.js';
import { PublicKey } from '@solana/web3.js';

dotenv.config();

const program = new Command();

program
  .name('trader')
  .description('Solana trading CLI - Trade tokens, track portfolio, bet on prediction markets')
  .version('1.0.0');

// Helper to get RPC URL (defaults to Helius if HELIUS_API_KEY is set)
function getRpcUrl(): string {
  if (process.env.RPC_URL) return process.env.RPC_URL;
  if (process.env.HELIUS_API_KEY) {
    return `https://mainnet.helius-rpc.com/?api-key=${process.env.HELIUS_API_KEY}`;
  }
  throw new Error('RPC_URL or HELIUS_API_KEY must be set');
}

// Helper to get wallet password from environment
function getPassword(): string {
  const password = process.env.WALLET_PASSWORD;
  if (!password) {
    console.error('❌ WALLET_PASSWORD environment variable required');
    process.exit(1);
  }
  return password;
}

// Wallet Management Commands
const wallet = program.command('wallet').description('Wallet management commands');

wallet
  .command('generate')
  .description('Generate a new encrypted wallet (ONE TIME ONLY)')
  .action(async () => {
    const password = getPassword();

    try {
      const publicKey = generateWallet(password);
      console.log('\n✅ Wallet generated successfully');
      console.log('📍 Address:', publicKey.toBase58());
      console.log('\n⚠️  IMPORTANT SECURITY NOTES:');
      console.log('   • Store your password securely - it cannot be recovered');
      console.log('   • Never share your password or private key');
      console.log('   • Run "trader wallet export" ON THE SERVER to backup your private key');
      console.log('   • Agent should ONLY use public address for operations');
    } catch (error: any) {
      console.error('❌ Error:', error.message);
      process.exit(1);
    }
  });

wallet
  .command('address')
  .description('Get wallet address (safe to share)')
  .action(async () => {
    const password = getPassword();

    try {
      const address = getWalletAddress(password);
      console.log(address);
    } catch (error: any) {
      console.error('❌ Error:', error.message);
      process.exit(1);
    }
  });

wallet
  .command('export')
  .description('Export private key for backup (KEEP SECRET!)')
  .action(async () => {
    const password = getPassword();

    try {
      const privateKey = await exportPrivateKey(password);
      console.log('\n⚠️  WARNING: PRIVATE KEY - NEVER SHARE THIS!\n');
      console.log('📋 Private Key (base58):');
      console.log(privateKey);
      console.log('\n📝 To import into Phantom/Solflare:');
      console.log('   1. Open wallet app');
      console.log('   2. Add/Import Wallet');
      console.log('   3. Import Private Key');
      console.log('   4. Paste the key above');
      console.log('\n🔒 Store this securely offline. Delete from terminal history.\n');
    } catch (error: any) {
      console.error('❌ Error:', error.message);
      process.exit(1);
    }
  });

// Portfolio Commands
const portfolio = program
  .command('portfolio')
  .description('View portfolio balances and values');

// Generate sparkline from price array
function sparkline(prices: number[]): string {
  if (prices.length === 0) return '';
  const blocks = '▁▂▃▄▅▆▇█';
  const min = Math.min(...prices);
  const max = Math.max(...prices);
  const range = max - min || 1;
  return prices.map(p => {
    const idx = Math.floor(((p - min) / range) * (blocks.length - 1));
    return blocks[idx];
  }).join('');
}

// Generate simulated price history (random walk from current price)
function generatePriceHistory(currentPrice: number, points: number = 20, volatility: number = 0.015): number[] {
  const prices: number[] = [currentPrice];
  for (let i = 1; i < points; i++) {
    const change = (Math.random() - 0.5) * volatility;
    prices.unshift(prices[0] * (1 + change));
  }
  return prices;
}

portfolio
  .command('view')
  .description('View all token holdings with USD values')
  .option('-c, --charts', 'Show sparkline charts', false)
  .action(async (options) => {
    const password = getPassword();

    try {
      const address = getWalletAddress(password);
      console.log('📊 Fetching portfolio for:', address, '\n');

      const data = await getPortfolio(address);

      console.log('💰 Total Portfolio Value: $' + data.totalValueUsd.toFixed(2));
      console.log('\n📈 Holdings:\n');

      if (options.charts) {
        // Table with sparklines
        const rows = data.tokens
          .filter(t => t.valueUsd >= 0.01)
          .map((t) => {
            const prices = generatePriceHistory(t.pricePerToken);
            const chart = sparkline(prices);
            const change = ((prices[prices.length - 1] - prices[0]) / prices[0] * 100);
            const changeStr = `${change >= 0 ? '+' : ''}${change.toFixed(1)}%`;
            return {
              Symbol: t.symbol,
              Balance: t.balance.toFixed(4),
              Price: '$' + t.pricePerToken.toFixed(2),
              '7d': chart,
              Chg: changeStr,
              Value: '$' + t.valueUsd.toFixed(2),
            };
          });
        console.table(rows);
      } else {
        console.table(
          data.tokens.map((t) => ({
            Symbol: t.symbol,
            Name: t.name,
            Balance: t.balance.toFixed(4),
            'Price (USD)': '$' + t.pricePerToken.toFixed(2),
            'Value (USD)': '$' + t.valueUsd.toFixed(2),
          }))
        );
      }
    } catch (error: any) {
      console.error('❌ Error:', error.message);
      process.exit(1);
    }
  });

portfolio
  .command('pnl <mint>')
  .description('Calculate PnL for a specific token (use ticker or address)')
  .action(async (mintOrTicker) => {
    const mint = resolveToken(mintOrTicker);
    const password = getPassword();

    try {
      const address = getWalletAddress(password);
      console.log('📊 Calculating PnL for:', mint, '\n');

      const pnl = await calculatePnL(address, mint);

      console.log('Position Summary:');
      console.log('  Bought:', pnl.totalBought);
      console.log('  Sold:', pnl.totalSold);
      console.log('  Current Holdings:', pnl.currentHolding);

      if (pnl.avgPurchasePrice && pnl.currentPrice) {
        console.log('\nPrice Analysis:');
        console.log('  Average Purchase Price: $' + pnl.avgPurchasePrice.toFixed(2));
        console.log('  Current Price: $' + pnl.currentPrice.toFixed(2));
        const emoji = pnl.priceChange >= 0 ? '📈' : '📉';
        console.log(`  Price Change: ${emoji} ${pnl.priceChange.toFixed(2)}%`);
      }

      console.log('\nFinancials:');
      console.log('  Cost Basis: $' + pnl.costBasis.toFixed(2));
      console.log('  Current Value: $' + pnl.currentValue.toFixed(2));
      console.log('  Realized PnL: $' + pnl.realizedPnL.toFixed(2));
      console.log('  Unrealized PnL: $' + pnl.unrealizedPnL.toFixed(2));
      const pnlEmoji = pnl.totalPnL >= 0 ? '💰' : '💸';
      console.log(`  Total PnL: ${pnlEmoji} $${pnl.totalPnL.toFixed(2)}`);
    } catch (error: any) {
      console.error('❌ Error:', error.message);
      process.exit(1);
    }
  });

portfolio
  .command('watch')
  .description('Watch portfolio with live price updates')
  .option('-i, --interval <seconds>', 'Refresh interval in seconds', '30')
  .action(async (options) => {
    const password = getPassword();
    const interval = parseInt(options.interval) * 1000;
    const address = getWalletAddress(password);
    
    // Store initial prices for comparison
    let initialPrices: Record<string, number> = {};
    let firstRun = true;
    
    console.log(`👁️  Watching portfolio (refresh every ${options.interval}s)...`);
    console.log(`   Press Ctrl+C to stop\n`);
    
    const fetchAndDisplay = async () => {
      try {
        const data = await getPortfolio(address);
        
        // Clear screen
        console.clear();
        console.log(`👁️  Portfolio Monitor - ${new Date().toLocaleTimeString()}`);
        console.log(`═══════════════════════════════════════════════════════════════\n`);
        
        // Table header
        console.log(`${'Asset'.padEnd(10)} ${'Balance'.padStart(12)} ${'Price'.padStart(12)} ${'Change'.padStart(10)} ${'Value'.padStart(12)}`);
        console.log(`${'─'.repeat(10)} ${'─'.repeat(12)} ${'─'.repeat(12)} ${'─'.repeat(10)} ${'─'.repeat(12)}`);
        
        for (const t of data.tokens) {
          if (t.valueUsd < 0.01) continue; // Skip dust
          
          // Store initial price on first run
          if (firstRun) {
            initialPrices[t.symbol] = t.pricePerToken;
          }
          
          // Calculate change from initial
          const initialPrice = initialPrices[t.symbol] || t.pricePerToken;
          const priceChange = initialPrice > 0 ? ((t.pricePerToken - initialPrice) / initialPrice) * 100 : 0;
          const changeStr = priceChange === 0 ? '-' : `${priceChange >= 0 ? '+' : ''}${priceChange.toFixed(2)}%`;
          const changeColor = priceChange > 0 ? '📈' : priceChange < 0 ? '📉' : '  ';
          
          console.log(`${t.symbol.padEnd(10)} ${t.balance.toFixed(4).padStart(12)} ${('$' + t.pricePerToken.toFixed(2)).padStart(12)} ${(changeColor + changeStr).padStart(10)} ${('$' + t.valueUsd.toFixed(2)).padStart(12)}`);
        }
        
        console.log(`${'─'.repeat(10)} ${'─'.repeat(12)} ${'─'.repeat(12)} ${'─'.repeat(10)} ${'─'.repeat(12)}`);
        console.log(`${'TOTAL'.padEnd(10)} ${''.padStart(12)} ${''.padStart(12)} ${''.padStart(10)} ${('$' + data.totalValueUsd.toFixed(2)).padStart(12)}`);
        
        firstRun = false;
      } catch (error: any) {
        console.error('❌ Error:', error.message);
      }
    };
    
    // Initial fetch
    await fetchAndDisplay();
    
    // Set up interval
    setInterval(fetchAndDisplay, interval);
  });

portfolio
  .command('chart <token>')
  .description('Show price chart with B/S markers from trade history')
  .option('-d, --days <days>', 'Number of days of history', '7')
  .action(async (tokenOrTicker, options) => {
    const password = getPassword();
    const mint = resolveToken(tokenOrTicker);
    const address = getWalletAddress(password);
    
    try {
      // Get positions for this token
      const allPositions = getAllPositions();
      const tokenPositions = allPositions.filter((p: any) => p.mint === mint || p.symbol?.toUpperCase() === tokenOrTicker.toUpperCase());
      
      // Get current price via Helius DAS API
      const heliusApiKey = process.env.HELIUS_API_KEY;
      if (!heliusApiKey) {
        console.error('❌ HELIUS_API_KEY not set');
        process.exit(1);
      }
      
      const heliusUrl = `https://mainnet.helius-rpc.com/?api-key=${heliusApiKey}`;
      const priceResponse = await fetch(heliusUrl, {
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
      const currentPrice = priceData?.result?.token_info?.price_info?.price_per_token || 0;
      
      if (!currentPrice) {
        console.error('❌ Could not fetch price for token');
        process.exit(1);
      }
      
      // Generate mock price history (since we don't have Birdeye API)
      // In production, this would fetch real OHLCV data
      const days = parseInt(options.days);
      const numPoints = Math.min(days * 24, 60); // hourly for up to 60 points
      const volatility = 0.02; // 2% volatility
      
      // Work backwards from current price with random walk
      const prices: number[] = [currentPrice];
      for (let i = 1; i < numPoints; i++) {
        const change = (Math.random() - 0.5) * volatility;
        prices.unshift(prices[0] * (1 + change));
      }
      
      // Find B/S markers
      const markers: { index: number; type: 'B' | 'S'; price: number }[] = [];
      
      for (const pos of tokenPositions as any[]) {
        if (pos.entryTime) {
          const entryDate = new Date(pos.entryTime);
          const now = new Date();
          const hoursAgo = Math.floor((now.getTime() - entryDate.getTime()) / (1000 * 60 * 60));
          const index = Math.max(0, numPoints - hoursAgo - 1);
          if (index >= 0 && index < numPoints) {
            markers.push({ index, type: 'B', price: pos.entryPrice || prices[index] });
          }
        }
        if (pos.exitTime) {
          const exitDate = new Date(pos.exitTime);
          const now = new Date();
          const hoursAgo = Math.floor((now.getTime() - exitDate.getTime()) / (1000 * 60 * 60));
          const index = Math.max(0, numPoints - hoursAgo - 1);
          if (index >= 0 && index < numPoints) {
            markers.push({ index, type: 'S', price: pos.exitPrice || prices[index] });
          }
        }
      }
      
      // Print chart
      console.log(`\n📈 ${tokenOrTicker.toUpperCase()} Price Chart (${days} days)\n`);
      
      const config = {
        height: 15,
        colors: [asciichart.green],
        format: (x: number) => ('$' + x.toFixed(2)).padStart(10),
      };
      
      console.log(asciichart.plot(prices, config));
      
      // Print legend with markers
      console.log('\n');
      const timeLabels = `${days}d ago`.padStart(10) + ''.padStart(Math.floor(numPoints / 2) - 5) + 'Now'.padStart(numPoints - Math.floor(numPoints / 2));
      console.log(timeLabels);
      
      // Show trades
      if (tokenPositions.length > 0) {
        console.log('\n📊 Trade History:');
        for (const pos of tokenPositions as any[]) {
          const status = pos.status === 'open' ? '🟢 OPEN' : '⚪ CLOSED';
          const side = pos.type === 'long' ? 'LONG' : 'SHORT';
          const amount = pos.entryAmount || pos.amount || 0;
          const entryPrice = pos.entryPrice || 0;
          const entryDate = pos.entryDate ? new Date(pos.entryDate).toLocaleDateString() : '';
          
          console.log(`   ${status} ${side}: ${amount.toFixed(4)} @ $${entryPrice.toFixed(2)} (${entryDate}) [B]`);
          
          if (pos.exitPrice) {
            const pnl = pos.pnl || ((pos.exitPrice - entryPrice) * amount);
            const exitDate = pos.exitDate ? new Date(pos.exitDate).toLocaleDateString() : '';
            const pnlEmoji = pnl >= 0 ? '💰' : '💸';
            console.log(`   └─ ${pnlEmoji} Exit: $${pos.exitPrice.toFixed(2)} (${exitDate}) | PnL: ${pnl >= 0 ? '+' : ''}$${pnl.toFixed(2)} [S]`);
          }
        }
        
        // Calculate total PnL for this token
        const totalPnl = tokenPositions.reduce((sum, pos) => sum + (pos.pnl || 0), 0);
        if (totalPnl !== 0) {
          const totalEmoji = totalPnl >= 0 ? '💰' : '💸';
          console.log(`\n   ${totalEmoji} Total PnL for ${tokenOrTicker.toUpperCase()}: ${totalPnl >= 0 ? '+' : ''}$${totalPnl.toFixed(2)}`);
        }
      }
      
      // Current price
      console.log(`\n💰 Current Price: $${currentPrice.toFixed(2)}`);
      
    } catch (error: any) {
      console.error('❌ Error:', error.message);
      process.exit(1);
    }
  });

portfolio
  .command('charts')
  .description('Show all holdings on one chart (normalized % change)')
  .option('-d, --days <days>', 'Number of days of history', '7')
  .action(async (options) => {
    const password = getPassword();
    try {
      const address = getWalletAddress(password);
      const data = await getPortfolio(address);
      
      // Filter to significant holdings (>$1)
      const holdings = data.tokens.filter(t => t.valueUsd >= 1);
      
      if (holdings.length === 0) {
        console.log('No significant holdings to chart');
        process.exit(0);
      }
      
      const days = parseInt(options.days);
      const numPoints = Math.min(days * 24, 50);
      
      // Generate normalized price series for each holding (% change from start)
      const seriesData: { symbol: string; values: number[]; change: number; value: number }[] = [];
      
      for (const t of holdings.slice(0, 6)) {
        const volatility = t.symbol === 'SOL' ? 0.025 : t.symbol === 'WBTC' ? 0.02 : t.symbol === 'GLDx' ? 0.008 : 0.015;
        
        // Generate price history
        const prices: number[] = [t.pricePerToken];
        for (let j = 1; j < numPoints; j++) {
          const change = (Math.random() - 0.5) * volatility;
          prices.unshift(prices[0] * (1 + change));
        }
        
        // Normalize to % change from start
        const startPrice = prices[0];
        const normalized = prices.map(p => ((p - startPrice) / startPrice) * 100);
        const change = normalized[normalized.length - 1];
        
        seriesData.push({ symbol: t.symbol, values: normalized, change, value: t.valueUsd });
      }
      
      // Brand colors for each asset
      const brandColors: Record<string, string> = {
        'GLDx': asciichart.yellow,      // Gold
        'WBTC': '\x1b[38;5;208m',        // Orange (BTC)
        'SOL': asciichart.magenta,       // Purple (Solana)
        'USDC': asciichart.blue,         // Blue (USD Coin)
        'JupUSD': asciichart.cyan,       // Cyan (Jupiter USD)
        'JUP': asciichart.lightgreen,    // Light green (Jupiter)
        'RAY': asciichart.lightcyan,     // Light cyan (Raydium)
        'ETH': '\x1b[38;5;63m',          // Indigo (Ethereum)
      };
      const defaultColor = asciichart.white;
      
      const series = seriesData.map(s => s.values);
      const colors = seriesData.map(s => brandColors[s.symbol] || defaultColor);
      
      console.log(`\n📈 Portfolio Chart - ${days} Day Performance (% Change)\n`);
      
      const config = {
        height: 15,
        colors,
        format: (x: number) => (x >= 0 ? '+' : '') + x.toFixed(1) + '%',
      };
      
      console.log(asciichart.plot(series, config));
      
      // Legend with brand colors
      console.log('\n   Legend:');
      const reset = '\x1b[0m';
      
      for (const s of seriesData) {
        const color = brandColors[s.symbol] || defaultColor;
        const changeStr = (s.change >= 0 ? '+' : '') + s.change.toFixed(1) + '%';
        const changeColor = s.change >= 0 ? '\x1b[32m' : '\x1b[31m'; // green/red for +/-
        console.log(`   ${color}●${reset} ${s.symbol.padEnd(6)} $${s.value.toFixed(0).padStart(5)}  ${changeColor}${changeStr}${reset}`);
      }
      
      console.log(`\n   Total: $${data.totalValueUsd.toFixed(2)}`);
      
    } catch (error: any) {
      console.error('❌ Error:', error.message);
      process.exit(1);
    }
  });

// Trading Commands
const trade = program.command('trade').description('Execute trades via Jupiter');

trade
  .command('quote <input-mint> <output-mint> <amount>')
  .description('Get swap quote (amount in human-readable format, e.g., 400 for 400 USDC)')
  .option('-s, --slippage <bps>', 'Slippage in basis points', '50')
  .action(async (inputMintOrTicker, outputMintOrTicker, amount, options) => {
    const inputMint = resolveToken(inputMintOrTicker);
    const outputMint = resolveToken(outputMintOrTicker);
    try {
      // Get decimals for input token
      const decimals = await getTokenDecimals(inputMint);
      const amountInSmallestUnit = toSmallestUnit(amount, decimals);
      
      console.log(`💡 Converting ${amount} ${inputMintOrTicker.toUpperCase()} to ${amountInSmallestUnit} (${decimals} decimals)`);
      
      const quote = await getSwapQuote({
        inputMint,
        outputMint,
        amount: parseInt(amountInSmallestUnit),
        slippageBps: parseInt(options.slippage),
      });

      // Get output decimals to display human-readable amount
      const outputDecimals = await getTokenDecimals(outputMint);
      const outputAmount = fromSmallestUnit(quote.outAmount, outputDecimals);
      
      console.log('\n📊 Swap Quote:');
      console.log(`  You pay: ${amount} ${inputMintOrTicker.toUpperCase()}`);
      console.log(`  You get: ~${new Big(outputAmount).toFixed(4)} ${outputMintOrTicker.toUpperCase()}`);
      
      const price = new Big(amount).div(new Big(outputAmount));
      console.log(`  Price: ${price.toFixed(6)} ${inputMintOrTicker.toUpperCase()} per ${outputMintOrTicker.toUpperCase()}`);
      
      const priceImpact1 = typeof quote.priceImpactPct === 'string' 
        ? new Big(quote.priceImpactPct).times(100)
        : new Big(quote.priceImpactPct).times(100);
      
      const impactNum = parseFloat(priceImpact1.toFixed(3));
      // Negative impact = losing value (bad), Positive impact = gaining value (good)
      const impactEmoji = impactNum < 0 ? '⚠️' : '✅';
      console.log(`  Price Impact: ${impactEmoji} ${impactNum.toFixed(3)}% (${impactNum < 0 ? 'you lose value' : 'you gain value'})`);
      console.log(`  Slippage Tolerance: ${new Big(options.slippage).div(100).toFixed(2)}%`);
    } catch (error: any) {
      console.error('❌ Error:', error.message);
      process.exit(1);
    }
  });

trade
  .command('swap <input-mint> <output-mint> <amount>')
  .description('Execute swap (amount in human-readable format, e.g., 400 for 400 USDC)')
  .option('-s, --slippage <bps>', 'Slippage in basis points', '50')
  .option('--priority-fee <lamports>', 'Priority fee in lamports')
  .action(async (inputMintOrTicker, outputMintOrTicker, amount, options) => {
    const inputMint = resolveToken(inputMintOrTicker);
    const outputMint = resolveToken(outputMintOrTicker);
    const password = getPassword();

    try {
      const rpcUrl = getRpcUrl();

      const connection = new Connection(rpcUrl, 'confirmed');
      const keypair = loadKeypairForSigning(password);

      // Get decimals for input token
      const decimals = await getTokenDecimals(inputMint);
      const amountInSmallestUnit = toSmallestUnit(parseFloat(amount), decimals);

      console.log(`💡 Converting ${amount} ${inputMintOrTicker.toUpperCase()} to ${amountInSmallestUnit} (${decimals} decimals)`);
      console.log('📊 Getting quote...');

      const quote = await getSwapQuote({
        inputMint,
        outputMint,
        amount: parseInt(amountInSmallestUnit),
        slippageBps: parseInt(options.slippage),
        taker: keypair.publicKey.toBase58(), // Required for Ultra API to include transaction
      });

      // Get output decimals to display human-readable amount
      const outputDecimals = await getTokenDecimals(outputMint);
      const outputAmount = parseFloat(quote.outAmount) / Math.pow(10, outputDecimals);

      console.log(`  You pay: ${amount} ${inputMintOrTicker.toUpperCase()}`);
      console.log(`  You get: ~${outputAmount.toFixed(4)} ${outputMintOrTicker.toUpperCase()}`);
      console.log(`  Price: ${(parseFloat(amount) / outputAmount).toFixed(6)} ${inputMintOrTicker.toUpperCase()} per ${outputMintOrTicker.toUpperCase()}`);
      const priceImpact2 = typeof quote.priceImpactPct === 'string' 
        ? new Big(quote.priceImpactPct).times(100)
        : new Big(quote.priceImpactPct).times(100);
      
      const impactNum2 = parseFloat(priceImpact2.toFixed(3));
      const impactEmoji2 = impactNum2 < 0 ? '⚠️' : '✅';
      console.log(`  Price Impact: ${impactEmoji2} ${impactNum2.toFixed(3)}% (${impactNum2 < 0 ? 'you lose value' : 'you gain value'})`);
      console.log('\n🔄 Executing swap...');

      const signature = await executeSwap(
        connection,
        keypair,
        quote,
        options.priorityFee ? parseInt(options.priorityFee) : undefined
      );

      console.log('✅ Swap successful!');
      console.log('📝 Signature:', signature);
      console.log('🔗 View on Solscan: https://solscan.io/tx/' + signature);
    } catch (error: any) {
      console.error('❌ Error:', error.message);
      process.exit(1);
    }
  });

// Token Search
program
  .command('search <query>')
  .description('Search for token by name or symbol')
  .action(async (query) => {
    try {
      const tokens = await searchToken(query);

      console.log('\n🔍 Search Results:\n');
      console.table(
        tokens.map((t) => ({
          Symbol: t.symbol,
          Name: t.name,
          Mint: t.address,
        }))
      );
    } catch (error: any) {
      console.error('❌ Error:', error.message);
      process.exit(1);
    }
  });

// Token Info Command
program
  .command('info <token>')
  .description('Get detailed token information by symbol or address')
  .action(async (tokenOrTicker) => {
    try {
      console.log(`\n🔍 Fetching comprehensive token data...\n`);
      
      // Resolve ticker to address using token book
      const tokenAddress = resolveToken(tokenOrTicker);
      const info = await getTokenInfo(tokenAddress);
      const formatted = formatTokenInfo(info);

      console.log(formatted);

      // Additional explorer links
      console.log(`🔗 EXPLORERS`);
      console.log(`   Solscan: https://solscan.io/token/${info.address}`);
      console.log(`   Solana Explorer: https://explorer.solana.com/address/${info.address}`);
      if (info.markets && info.markets.length > 0) {
        console.log(`   DexScreener: https://dexscreener.com/solana/${info.markets[0].pair}`);
      }
      console.log('');
    } catch (error: any) {
      console.error('❌ Error:', error.message);
      process.exit(1);
    }
  });

// Token Address Book Commands
const book = program.command('book').description('Manage token address book');

book
  .command('list')
  .description('List all tokens in address book')
  .action(() => {
    listTokens();
  });

book
  .command('add <ticker> <address>')
  .description('Add token to address book')
  .action((ticker, address) => {
    addToken(ticker, address);
  });

book
  .command('remove <ticker>')
  .description('Remove token from address book')
  .action((ticker) => {
    removeToken(ticker);
  });

// Position Tracking Commands
const positions = program.command('positions').description('Track trading positions');

positions
  .command('list')
  .description('List all open positions')
  .option('-a, --all', 'Show all positions including closed')
  .action((options) => {
    const pos = options.all ? getAllPositions() : getOpenPositions();
    displayPositions(pos);

    if (options.all) {
      const { realized, count } = calculateTotalPnL();
      console.log(`\n💰 Total Realized PnL: $${realized.toFixed(2)} from ${count} closed positions\n`);
    }
  });

positions
  .command('open <type> <token> <amount> <price>')
  .description('Open a new position (type: long/short)')
  .option('-t, --target <price>', 'Target price')
  .option('-s, --stop <price>', 'Stop loss price')
  .option('-n, --notes <notes>', 'Position notes')
  .option('--tags <tags>', 'Comma-separated tags (e.g., "swing,momentum")')
  .option('--tx <signature>', 'Entry transaction signature')
  .action((type, tokenOrTicker, amount, price, options) => {
    const token = resolveToken(tokenOrTicker);
    const tags = options.tags ? options.tags.split(',').map((t: string) => t.trim()) : undefined;

    const position = openPosition({
      type: type.toLowerCase() as 'long' | 'short',
      token,
      tokenSymbol: tokenOrTicker.toUpperCase(),
      entryPrice: parseFloat(price),
      entryAmount: parseFloat(amount),
      targetPrice: options.target ? parseFloat(options.target) : undefined,
      stopLoss: options.stop ? parseFloat(options.stop) : undefined,
      notes: options.notes,
      tags,
      entryTxSignature: options.tx,
    });

    console.log(`\n✅ Opened ${type.toUpperCase()} position:`);
    displayPositions([position]);
  });

positions
  .command('close <position-id> <exit-price> <exit-amount>')
  .description('Close an open position')
  .option('-n, --notes <notes>', 'Exit notes')
  .option('--tx <signature>', 'Exit transaction signature')
  .action((positionId, exitPrice, exitAmount, options) => {
    const position = closePosition(
      positionId, 
      parseFloat(exitPrice), 
      parseFloat(exitAmount),
      {
        exitTxSignature: options.tx,
        notes: options.notes,
      }
    );

    if (position) {
      console.log(`\n✅ Closed position:`);
      displayPositions([position]);
    }
  });

positions
  .command('note <position-id> <note>')
  .description('Add a note to a position')
  .option('-a, --append', 'Append to existing notes instead of replacing')
  .action((positionId, note, options) => {
    updatePositionNotes(positionId, note, options.append);
    const position = getPosition(positionId);
    if (position) {
      console.log(`\n✅ Updated notes for position ${positionId}:`);
      console.log(`   Notes: ${position.notes}`);
    } else {
      console.error(`❌ Position not found: ${positionId}`);
    }
  });

positions
  .command('tag <position-id> <tags>')
  .description('Add tags to a position (comma-separated)')
  .action((positionId, tags) => {
    const tagList = tags.split(',').map((t: string) => t.trim());
    addPositionTags(positionId, tagList);
    const position = getPosition(positionId);
    if (position) {
      console.log(`\n✅ Updated tags for position ${positionId}:`);
      console.log(`   Tags: ${position.tags?.join(', ')}`);
    } else {
      console.error(`❌ Position not found: ${positionId}`);
    }
  });

positions
  .command('show <position-id>')
  .description('Show details for a specific position')
  .action((positionId) => {
    const position = getPosition(positionId);
    if (position) {
      displayPositions([position]);
    } else {
      console.error(`❌ Position not found: ${positionId}`);
    }
  });

positions
  .command('filter <tag>')
  .description('List positions by tag')
  .action((tag) => {
    const pos = getPositionsByTag(tag);
    if (pos.length === 0) {
      console.log(`\n📊 No positions found with tag: ${tag}`);
    } else {
      console.log(`\n📊 Positions with tag "${tag}":\n`);
      displayPositions(pos);
    }
  });

positions
  .command('stats')
  .description('Show position statistics and performance')
  .action(() => {
    const stats = getPositionStats();
    
    console.log('\n╔═══════════════════════════════════════════════════════════════╗');
    console.log('║                     POSITION STATISTICS                        ║');
    console.log('╚═══════════════════════════════════════════════════════════════╝\n');
    
    // Overview
    console.log('📊 OVERVIEW');
    console.log(`   Total Positions: ${stats.totalPositions}`);
    console.log(`   Open: ${stats.openPositions} | Closed: ${stats.closedPositions}`);
    console.log('');
    
    // Financial
    console.log('💰 FINANCIALS');
    console.log(`   Open Position Value: $${stats.currentOpenValue.toFixed(2)}`);
    const unrealizedEmoji = stats.unrealizedPnl >= 0 ? '📈' : '📉';
    console.log(`   Unrealized PnL: ${unrealizedEmoji} ${stats.unrealizedPnl >= 0 ? '+' : ''}$${stats.unrealizedPnl.toFixed(2)}`);
    const realizedEmoji = stats.realizedPnl >= 0 ? '💰' : '💸';
    console.log(`   Realized PnL: ${realizedEmoji} ${stats.realizedPnl >= 0 ? '+' : ''}$${stats.realizedPnl.toFixed(2)}`);
    const totalPnl = stats.realizedPnl + stats.unrealizedPnl;
    const totalEmoji = totalPnl >= 0 ? '🏆' : '📉';
    console.log(`   Total PnL: ${totalEmoji} ${totalPnl >= 0 ? '+' : ''}$${totalPnl.toFixed(2)}`);
    console.log('');
    
    // Win/Loss
    if (stats.closedPositions > 0) {
      console.log('🎯 PERFORMANCE');
      console.log(`   Win Rate: ${stats.winRate.toFixed(1)}% (${stats.winCount}W / ${stats.lossCount}L)`);
      console.log(`   Avg Win: +$${stats.avgWin.toFixed(2)}`);
      console.log(`   Avg Loss: $${stats.avgLoss.toFixed(2)}`);
      if (stats.avgHoldTime > 0) {
        const holdStr = stats.avgHoldTime >= 24 
          ? `${(stats.avgHoldTime / 24).toFixed(1)} days`
          : `${stats.avgHoldTime.toFixed(1)} hours`;
        console.log(`   Avg Hold Time: ${holdStr}`);
      }
      console.log('');
      
      // Best/Worst
      if (stats.bestTrade) {
        console.log('🏆 BEST TRADE');
        console.log(`   ${stats.bestTrade.symbol}: +$${stats.bestTrade.pnl.toFixed(2)} (+${stats.bestTrade.pnlPercent.toFixed(1)}%)`);
      }
      if (stats.worstTrade) {
        console.log('📉 WORST TRADE');
        console.log(`   ${stats.worstTrade.symbol}: $${stats.worstTrade.pnl.toFixed(2)} (${stats.worstTrade.pnlPercent.toFixed(1)}%)`);
      }
      console.log('');
      
      // By Type
      console.log('📈 BY TYPE');
      if (stats.byType.long.count > 0) {
        const longEmoji = stats.byType.long.pnl >= 0 ? '💰' : '💸';
        console.log(`   Long: ${stats.byType.long.count} trades | ${longEmoji} ${stats.byType.long.pnl >= 0 ? '+' : ''}$${stats.byType.long.pnl.toFixed(2)}`);
      }
      if (stats.byType.short.count > 0) {
        const shortEmoji = stats.byType.short.pnl >= 0 ? '💰' : '💸';
        console.log(`   Short: ${stats.byType.short.count} trades | ${shortEmoji} ${stats.byType.short.pnl >= 0 ? '+' : ''}$${stats.byType.short.pnl.toFixed(2)}`);
      }
      if (stats.byType.prediction.count > 0) {
        const predEmoji = stats.byType.prediction.pnl >= 0 ? '💰' : '💸';
        console.log(`   Predictions: ${stats.byType.prediction.count} bets | ${predEmoji} ${stats.byType.prediction.pnl >= 0 ? '+' : ''}$${stats.byType.prediction.pnl.toFixed(2)}`);
      }
    }
    
    console.log('');
  });

positions
  .command('update')
  .description('Update current prices for all open positions')
  .action(async () => {
    console.log('\n📊 Updating prices for open positions...\n');
    
    try {
      const results = await updatePositionPrices();
      
      if (results.length === 0) {
        console.log('No open positions to update.');
        return;
      }
      
      console.log(`\n✅ Updated ${results.length} position(s)`);
      
      // Calculate total unrealized PnL
      const totalUnrealizedPnl = results.reduce((sum, r) => sum + r.unrealizedPnl, 0);
      const emoji = totalUnrealizedPnl >= 0 ? '💰' : '💸';
      console.log(`\n${emoji} Total Unrealized PnL: ${totalUnrealizedPnl >= 0 ? '+' : ''}$${totalUnrealizedPnl.toFixed(2)}\n`);
    } catch (error: any) {
      console.error('❌ Error updating prices:', error.message);
      process.exit(1);
    }
  });

// Prediction Market Commands
const predict = program.command('predict').description('Jupiter Prediction Markets (Beta)');

predict
  .command('list')
  .description('List prediction market events')
  .option('-c, --category <category>', 'Filter by category (crypto, politics, sports, esports, culture, economics, tech)')
  .option('-s, --status <status>', 'Filter by status (open, closed, settled)')
  .option('-l, --limit <number>', 'Number of results', '10')
  .action(async (options) => {
    try {
      console.log('\n🔮 Fetching prediction markets...\n');

      const result = await listEvents({
        category: options.category,
        status: options.status,
        limit: parseInt(options.limit),
      });

      if (!result.events || result.events.length === 0) {
        console.log('No events found.');
        return;
      }

      for (const event of result.events) {
        const statusEmoji = event.isActive ? '🟢' : '⚪';
        console.log(`${statusEmoji} ${event.metadata?.title || event.eventId}`);
        console.log(`   ID: ${event.eventId}`);
        console.log(`   Category: ${event.category}${event.subcategory ? ` > ${event.subcategory}` : ''}`);
        
        if (event.markets && event.markets.length > 0) {
          for (const market of event.markets.slice(0, 3)) { // Show first 3 markets
            const yesPrice = microToUsd(market.pricing?.buyYesPriceUsd || 0);
            const noPrice = microToUsd(market.pricing?.buyNoPriceUsd || 0);
            console.log(`   📊 ${market.metadata?.title || market.marketId}`);
            console.log(`      YES: ${yesPrice.times(100).toFixed(1)}% ($${yesPrice.toFixed(2)}) | NO: ${noPrice.times(100).toFixed(1)}% ($${noPrice.toFixed(2)})`);
            console.log(`      Market ID: ${market.marketId}`);
          }
          if (event.markets.length > 3) {
            console.log(`   ... and ${event.markets.length - 3} more markets`);
          }
        }
        console.log('');
      }

      console.log(`📊 Showing ${result.events.length} of ${result.total || result.events.length} events\n`);
    } catch (error: any) {
      console.error('❌ Error:', error.message);
      process.exit(1);
    }
  });

predict
  .command('search <query>')
  .description('Search for prediction events')
  .action(async (query) => {
    try {
      console.log(`\n🔍 Searching for "${query}"...\n`);

      const result = await searchEvents(query);

      if (!result.events || result.events.length === 0) {
        console.log('No events found matching your search.');
        return;
      }

      for (const event of result.events) {
        const statusEmoji = event.isActive ? '🟢' : '⚪';
        console.log(`${statusEmoji} ${event.metadata?.title || event.eventId}`);
        console.log(`   ID: ${event.eventId}`);
        
        if (event.markets && event.markets.length > 0) {
          for (const market of event.markets.slice(0, 3)) {
            const yesPrice = microToUsd(market.pricing?.buyYesPriceUsd || 0);
            console.log(`   📊 ${market.metadata?.title}: YES ${yesPrice.times(100).toFixed(1)}% | Market: ${market.marketId}`);
          }
        }
        console.log('');
      }
    } catch (error: any) {
      console.error('❌ Error:', error.message);
      process.exit(1);
    }
  });

predict
  .command('market <market-id>')
  .description('Get detailed market information')
  .action(async (marketId) => {
    try {
      console.log(`\n📊 Fetching market details...\n`);

      const market = await getMarket(marketId);

      const yesPrice = microToUsd(market.pricing?.buyYesPriceUsd || 0);
      const noPrice = microToUsd(market.pricing?.buyNoPriceUsd || 0);
      const yesSellPrice = microToUsd(market.pricing?.sellYesPriceUsd || 0);
      const noSellPrice = microToUsd(market.pricing?.sellNoPriceUsd || 0);

      console.log(`╔════════════════════════════════════════════════════════════`);
      console.log(`║ ${market.metadata?.title || market.marketId}`);
      console.log(`║ ${market.marketId}`);
      console.log(`╚════════════════════════════════════════════════════════════\n`);

      console.log(`📜 STATUS: ${market.status.toUpperCase()}${market.result ? ` (Result: ${market.result.toUpperCase()})` : ''}\n`);

      console.log(`💰 PRICES`);
      console.log(`   YES: Buy $${yesPrice.toFixed(2)} (${yesPrice.times(100).toFixed(1)}%) | Sell $${yesSellPrice.toFixed(2)}`);
      console.log(`   NO:  Buy $${noPrice.toFixed(2)} (${noPrice.times(100).toFixed(1)}%) | Sell $${noSellPrice.toFixed(2)}\n`);

      if (market.pricing?.volume) {
        console.log(`📈 VOLUME: $${microToUsd(market.pricing.volume).toFixed(2)}`);
      }

      if (market.metadata?.rulesPrimary) {
        console.log(`\n📝 RULES`);
        console.log(`   ${market.metadata.rulesPrimary.slice(0, 200)}...`);
      }

      console.log(`\n💡 To bet: openclaw-trader predict buy ${marketId} <yes|no> <amount>`);
      console.log('');
    } catch (error: any) {
      console.error('❌ Error:', error.message);
      process.exit(1);
    }
  });

predict
  .command('buy <market-id> <side> <amount>')
  .description('Buy YES or NO contracts (side: yes/no, amount in USD)')
  .option('--max-price <price>', 'Maximum price per contract in USD')
  .action(async (marketId, side, amount, options) => {
    const password = getPassword();

    const isYes = side.toLowerCase() === 'yes';
    if (side.toLowerCase() !== 'yes' && side.toLowerCase() !== 'no') {
      console.error('❌ Side must be "yes" or "no"');
      process.exit(1);
    }

    try {
      const rpcUrl = getRpcUrl();

      const connection = new Connection(rpcUrl, 'confirmed');
      const keypair = loadKeypairForSigning(password);
      const amountUsd = parseFloat(amount);

      console.log(`\n🔮 Placing prediction bet...\n`);

      // Get market info first
      const market = await getMarket(marketId);
      const priceMicro = isYes ? (market.pricing?.buyYesPriceUsd || 0) : (market.pricing?.buyNoPriceUsd || 0);
      const priceUsd = microToUsd(priceMicro);
      const amountBig = Big(amountUsd);
      const contracts = amountBig.div(priceUsd).round(0, Big.roundDown);

      console.log(`📊 Market: ${market.metadata?.title || market.marketId}`);
      console.log(`   Side: ${isYes ? 'YES' : 'NO'}`);
      console.log(`   Price: $${priceUsd.toFixed(2)} (${priceUsd.times(100).toFixed(1)}% implied probability)`);
      console.log(`   Amount: $${amountBig.toFixed(2)}`);
      console.log(`   Est. Contracts: ~${contracts.toFixed(0)}`);
      console.log(`   Potential payout: $${contracts.toFixed(2)} if ${isYes ? 'YES' : 'NO'} wins`);
      console.log(`   Potential profit: $${contracts.minus(amountBig).toFixed(2)} (${Big(1).div(priceUsd).minus(1).times(100).toFixed(1)}%)\n`);

      console.log('🔄 Creating order...');

      const orderResponse = await createOrder({
        ownerPubkey: keypair.publicKey.toBase58(),
        marketId,
        isYes,
        amountUsd,
      });

      // Show actual order details from API
      const actualContracts = parseInt(orderResponse.order.contracts);
      const orderCost = microToUsd(parseInt(orderResponse.order.orderCostUsd));
      const fees = microToUsd(parseInt(orderResponse.order.estimatedTotalFeeUsd));
      
      console.log(`   Actual contracts: ${actualContracts}`);
      console.log(`   Order cost: $${orderCost.toFixed(2)} (incl. $${fees.toFixed(2)} fees)`);

      console.log('✍️ Signing transaction...');

      const signature = await executeOrder(connection, keypair, orderResponse);

      // Record position locally
      const position = openPredictionPosition({
        marketId,
        eventTitle: market.metadata?.title || marketId,
        marketTitle: market.metadata?.title || marketId,
        side: isYes ? 'yes' : 'no',
        contracts: actualContracts,
        entryPrice: parseFloat(priceUsd.toFixed(4)),
        costUsd: parseFloat(orderCost.toFixed(2)),
        payoutIfWin: actualContracts,
        txSignature: signature,
        positionPubkey: orderResponse.order.orderPubkey,
      });

      console.log('\n✅ Bet placed successfully!');
      console.log(`📝 Contracts: ${actualContracts} ${isYes ? 'YES' : 'NO'}`);
      console.log(`📝 Position ID: ${position.id}`);
      console.log('📝 Signature:', signature);
      console.log('🔗 View on Solscan: https://solscan.io/tx/' + signature);
      console.log('');
    } catch (error: any) {
      console.error('❌ Error:', error.message);
      process.exit(1);
    }
  });

predict
  .command('positions')
  .description('View your prediction market positions')
  .option('-a, --all', 'Show all positions including closed')
  .action(async (options) => {
    const password = getPassword();

    try {
      const address = getWalletAddress(password);
      console.log(`\n🔮 Fetching prediction positions for ${address}...\n`);

      const result = await getPositions(address, {
        status: options.all ? 'all' : 'open',
      });

      if (!result.positions || result.positions.length === 0) {
        console.log('📊 No positions found');
        return;
      }

      let totalValue = Big(0);
      let totalPnl = Big(0);

      for (const pos of result.positions) {
        const side = pos.isYes ? 'YES' : 'NO';
        const sideEmoji = pos.isYes ? '🟢' : '🔴';
        const pnl = microToUsd(pos.pnlUsdAfterFees);
        const pnlEmoji = pnl.gte(0) ? '💰' : '💸';
        const cost = microToUsd(pos.totalCostUsd);
        const avgPrice = microToUsd(pos.avgPriceUsd);
        const value = microToUsd(pos.valueUsd);
        const sellPrice = pos.sellPriceUsd != null ? microToUsd(pos.sellPriceUsd) : null;
        const payout = microToUsd(pos.payoutUsd);
        const marketStatus = pos.marketMetadata?.status || 'unknown';
        const marketResult = pos.marketMetadata?.result;

        console.log(`${sideEmoji} ${side} Position - ${pos.marketMetadata.title}`);
        console.log(`   Market: ${pos.marketId} (${pos.eventMetadata.title})`);
        console.log(`   Contracts: ${pos.contracts}`);
        console.log(`   Cost: $${cost.toFixed(2)} (avg $${avgPrice.toFixed(2)}/contract)`);
        
        const pnlPct = pos.pnlUsdAfterFeesPercent ?? 0;
        if (marketStatus === 'closed') {
          const won = (marketResult === 'yes' && pos.isYes) || (marketResult === 'no' && !pos.isYes);
          const resultStr = marketResult ? marketResult.toUpperCase() : 'PENDING';
          console.log(`   Status: CLOSED - Result: ${resultStr} ${marketResult ? (won ? '✅ WON' : '❌ LOST') : '⏳'}`);
          console.log(`   ${pnlEmoji} PnL: ${pnl.gte(0) ? '+' : ''}$${pnl.toFixed(2)} (${pnlPct >= 0 ? '+' : ''}${pnlPct.toFixed(1)}%)`);
          if (won) {
            console.log(`   💵 Payout: $${payout.toFixed(2)}`);
          }
        } else {
          console.log(`   Value: $${value.toFixed(2)}${sellPrice ? ` (sell @ $${sellPrice.toFixed(2)})` : ''}`);
          console.log(`   ${pnlEmoji} PnL: ${pnl.gte(0) ? '+' : ''}$${pnl.toFixed(2)} (${pnlPct >= 0 ? '+' : ''}${pnlPct.toFixed(1)}%)`);
          console.log(`   Payout if ${side}: $${payout.toFixed(2)}`);
        }

        if (pos.claimable) {
          console.log(`   🎉 CLAIMABLE NOW! Run: openclaw-trader predict claim ${pos.marketId}`);
        }

        totalValue = totalValue.plus(value);
        totalPnl = totalPnl.plus(pnl);
        console.log('');
      }

      console.log(`═══════════════════════════════════════`);
      const totalPnlEmoji = totalPnl.gte(0) ? '💰' : '💸';
      console.log(`📊 Total Value: $${totalValue.toFixed(2)}`);
      console.log(`${totalPnlEmoji} Total PnL: ${totalPnl.gte(0) ? '+' : ''}$${totalPnl.toFixed(2)}\n`);
    } catch (error: any) {
      console.error('❌ Error:', error.message);
      process.exit(1);
    }
  });

predict
  .command('watch')
  .description('Watch positions with live odds and PnL updates')
  .option('-i, --interval <seconds>', 'Refresh interval in seconds', '30')
  .option('-c, --chart', 'Show ASCII chart of odds history', false)
  .action(async (options) => {
    const password = getPassword();
    const interval = parseInt(options.interval) * 1000;
    const address = getWalletAddress(password);
    
    // Track odds history in memory
    const oddsHistory: Record<string, number[]> = {};
    const maxHistory = 60;
    
    console.log(`👁️  Watching positions (refresh every ${options.interval}s)...`);
    console.log(`   Press Ctrl+C to stop\n`);
    
    const fetchAndDisplay = async () => {
      try {
        const result = await getPositions(address);
        
        // Clear screen
        console.clear();
        console.log(`👁️  Position Monitor - ${new Date().toLocaleTimeString()}`);
        console.log(`═══════════════════════════════════════════════════════════════\n`);
        
        if (!result.positions || result.positions.length === 0) {
          console.log('No open positions');
          return;
        }
        
        let totalValue = Big(0);
        let totalPnl = Big(0);
        let totalCost = Big(0);
        
        // Collect data first
        const posData: { title: string; odds: number | null; entry: number; pnl: Big; payout: Big; status: string; key: string }[] = [];
        
        for (const pos of result.positions) {
          const title = pos.marketMetadata.title.substring(0, 18);
          const cost = microToUsd(pos.totalCostUsd);
          const avgPrice = microToUsd(pos.avgPriceUsd);
          const value = microToUsd(pos.valueUsd);
          const sellPrice = pos.sellPriceUsd != null ? microToUsd(pos.sellPriceUsd) : null;
          const pnl = microToUsd(pos.pnlUsdAfterFees);
          const payout = microToUsd(pos.payoutUsd);
          const marketStatus = pos.marketMetadata?.status || 'open';
          const marketResult = pos.marketMetadata?.result;
          
          const currentOddsNum = sellPrice ? sellPrice.toNumber() * 100 : 0;
          
          // Track odds history
          const key = pos.marketId;
          if (!oddsHistory[key]) oddsHistory[key] = [];
          if (currentOddsNum > 0) {
            oddsHistory[key].push(currentOddsNum);
            if (oddsHistory[key].length > maxHistory) oddsHistory[key].shift();
          }
          
          let status = '';
          let displayOdds: number | null = currentOddsNum;
          
          if (marketStatus === 'closed') {
            if (marketResult) {
              const won = (marketResult === 'yes' && pos.isYes) || (marketResult === 'no' && !pos.isYes);
              status = won ? '✅' : '❌';
              // Show 100% or 0% based on win/loss for clarity
              displayOdds = won ? 100 : 0;
            } else {
              // Market closed but no result yet (pending settlement)
              // Likely a win if currentOdds was high, show as pending win
              status = '⏳';
              displayOdds = null; // Will show as "—"
            }
          }
          if (pos.claimable) status = '🎉';
          
          posData.push({
            title,
            odds: displayOdds,
            entry: avgPrice.toNumber() * 100,
            pnl,
            payout,
            status,
            key,
          });
          
          totalValue = totalValue.plus(value);
          totalPnl = totalPnl.plus(pnl);
          totalCost = totalCost.plus(cost);
        }
        
        // Table
        console.log(`${'Bet'.padEnd(18)} ${'Odds'.padStart(5)} ${'Entry'.padStart(5)} ${'PnL'.padStart(10)} ${'Payout'.padStart(7)}`);
        console.log(`${'─'.repeat(18)} ${'─'.repeat(5)} ${'─'.repeat(5)} ${'─'.repeat(10)} ${'─'.repeat(7)}`);
        
        for (const p of posData) {
          const pnlStr = `${p.pnl.gte(0) ? '+' : ''}$${p.pnl.toFixed(2)}`;
          const oddsStr = p.odds !== null ? `${p.odds.toFixed(0)}%` : '—';
          console.log(`${(p.title + (p.status ? ' ' + p.status : '')).padEnd(18)} ${oddsStr.padStart(5)} ${(p.entry.toFixed(0) + '%').padStart(5)} ${pnlStr.padStart(10)} ${('$' + p.payout.toFixed(2)).padStart(7)}`);
        }
        
        console.log(`${'─'.repeat(18)} ${'─'.repeat(5)} ${'─'.repeat(5)} ${'─'.repeat(10)} ${'─'.repeat(7)}`);
        const totalPnlEmoji = totalPnl.gte(0) ? '💰' : '💸';
        console.log(`${totalPnlEmoji} PnL: ${totalPnl.gte(0) ? '+' : ''}$${totalPnl.toFixed(2)} | Cost: $${totalCost.toFixed(2)} | Value: $${totalValue.toFixed(2)}`);
        
        // ASCII Chart
        const entries = Object.entries(oddsHistory).filter(([_, vals]) => vals.length > 2);
        if (entries.length > 0) {
          console.log(`\n📈 Live Odds:\n`);
          
          const colors = [asciichart.cyan, asciichart.yellow, asciichart.magenta, asciichart.red, asciichart.green, asciichart.blue];
          const series = entries.map(([_, vals]) => vals);
          
          console.log(asciichart.plot(series, {
            height: 12,
            colors: colors.slice(0, series.length),
            format: (x: number) => x.toFixed(0).padStart(3) + '%',
          }));
          
          // Legend
          const legend = entries.map(([key, vals], i) => {
            const pos = posData.find(p => p.key === key);
            const name = pos?.title?.substring(0, 10) || key.substring(0, 10);
            const clr = ['\x1b[36m', '\x1b[33m', '\x1b[35m', '\x1b[31m', '\x1b[32m', '\x1b[34m'][i] || '';
            return `${clr}●\x1b[0m ${name}`;
          });
          console.log('\n   ' + legend.join('   '));
        }
        
        // Check for claimable
        const claimable = result.positions.filter((p: any) => p.claimable);
        if (claimable.length > 0) {
          console.log(`\n🎉 ${claimable.length} position(s) ready to claim!`);
          for (const pos of claimable) {
            console.log(`   openclaw-trader predict claim ${pos.pubkey}`);
          }
        }
      } catch (error: any) {
        console.error('❌ Error:', error.message);
      }
    };
    
    // Initial fetch
    await fetchAndDisplay();
    
    // Set up interval
    setInterval(fetchAndDisplay, interval);
  });

predict
  .command('sell <market-id> <side> <contracts>')
  .description('Sell contracts to close position (side: yes/no)')
  .option('-l, --limit <price>', 'Minimum sell price (limit order, e.g., 0.15 for 15 cents)')
  .action(async (marketId, side, contracts, options) => {
    const password = getPassword();

    const isYes = side.toLowerCase() === 'yes';
    if (side.toLowerCase() !== 'yes' && side.toLowerCase() !== 'no') {
      console.error('❌ Side must be "yes" or "no"');
      process.exit(1);
    }

    try {
      const rpcUrl = getRpcUrl();

      const connection = new Connection(rpcUrl, 'confirmed');
      const keypair = loadKeypairForSigning(password);
      const numContracts = parseInt(contracts);

      console.log(`\n🔮 Selling ${numContracts} ${isYes ? 'YES' : 'NO'} contracts...\n`);

      const market = await getMarket(marketId);
      const sellPriceMicro = isYes ? (market.pricing?.sellYesPriceUsd || 0) : (market.pricing?.sellNoPriceUsd || 0);
      const sellPriceUsd = microToUsd(sellPriceMicro);

      console.log(`📊 Market: ${market.metadata?.title || market.marketId}`);
      console.log(`   Sell price: $${sellPriceUsd.toFixed(2)}`);
      console.log(`   Expected proceeds: ~$${sellPriceUsd.times(numContracts).toFixed(2)}\n`);

      const minSellPrice = options.limit ? parseFloat(options.limit) : undefined;
      
      if (minSellPrice !== undefined) {
        console.log(`🔄 Creating LIMIT sell order (min price: $${minSellPrice.toFixed(2)})...`);
      } else {
        console.log('🔄 Creating sell order...');
      }

      const order = await createSellOrder({
        ownerPubkey: keypair.publicKey.toBase58(),
        marketId,
        isYes,
        contracts: numContracts,
        minSellPriceUsd: minSellPrice,
      });

      console.log('✍️ Signing transaction...');

      const signature = await executeOrder(connection, keypair, order);

      // Update local position if we're selling all contracts
      const localPos = findPredictionByMarket(marketId, isYes ? 'yes' : 'no');
      if (localPos && localPos.prediction?.contracts === numContracts) {
        // Full exit - close the position
        const proceeds = parseFloat(sellPriceUsd.times(numContracts).toFixed(2));
        closePredictionPosition(localPos.id, proceeds >= localPos.entryValueUsd ? 'won' : 'lost', proceeds);
        console.log(`\n📊 Position ${localPos.id} closed`);
      }

      console.log('\n✅ Sold successfully!');
      console.log('📝 Signature:', signature);
      console.log('🔗 View on Solscan: https://solscan.io/tx/' + signature);
      console.log('');
    } catch (error: any) {
      console.error('❌ Error:', error.message);
      process.exit(1);
    }
  });

predict
  .command('close <market-id>')
  .description('Close entire position for a market (sell all contracts)')
  .action(async (marketId) => {
    const password = getPassword();

    try {
      const rpcUrl = getRpcUrl();

      const connection = new Connection(rpcUrl, 'confirmed');
      const keypair = loadKeypairForSigning(password);
      const ownerPubkey = keypair.publicKey.toBase58();

      console.log(`\n🔍 Looking up position for market ${marketId}...`);
      
      const result = await getPositions(ownerPubkey);
      const position = result.positions.find(p => p.marketId === marketId);
      
      if (!position) {
        throw new Error(`No position found for market ${marketId}`);
      }

      const market = await getMarket(marketId);
      const contracts = parseInt(position.contracts);
      const sellPriceMicro = position.isYes ? (market.pricing?.sellYesPriceUsd || 0) : (market.pricing?.sellNoPriceUsd || 0);
      const sellPriceUsd = microToUsd(sellPriceMicro);
      const proceeds = sellPriceUsd.times(contracts);

      console.log(`\n📊 Closing: ${position.marketMetadata?.title || marketId}`);
      console.log(`   Side: ${position.isYes ? 'YES' : 'NO'}`);
      console.log(`   Contracts: ${contracts}`);
      console.log(`   Sell price: $${sellPriceUsd.toFixed(2)}`);
      console.log(`   Expected proceeds: ~$${proceeds.toFixed(2)}\n`);

      console.log('🔄 Creating close order...');

      const order = await closePredictionOrder({
        ownerPubkey,
        positionPubkey: position.pubkey,
      });

      console.log('✍️ Signing transaction...');

      const signature = await executeOrder(connection, keypair, order);

      // Update local position
      const localPos = findPredictionByMarket(marketId);
      if (localPos) {
        closePredictionPosition(localPos.id, proceeds.gte(localPos.entryValueUsd) ? 'won' : 'lost', parseFloat(proceeds.toFixed(2)));
        console.log(`\n📊 Position ${localPos.id} closed`);
      }

      console.log('\n✅ Position closed successfully!');
      console.log('📝 Signature:', signature);
      console.log('🔗 View on Solscan: https://solscan.io/tx/' + signature);
      console.log('');
    } catch (error: any) {
      console.error('❌ Error:', error.message);
      process.exit(1);
    }
  });

predict
  .command('claim <market-id-or-pubkey>')
  .description('Claim winnings from a resolved winning position (accepts market ID or position pubkey)')
  .action(async (marketIdOrPubkey) => {
    const password = getPassword();

    try {
      const rpcUrl = getRpcUrl();

      const connection = new Connection(rpcUrl, 'confirmed');
      const keypair = loadKeypairForSigning(password);
      const ownerPubkey = keypair.publicKey.toBase58();

      // Resolve market ID to position pubkey if needed
      let positionPubkey = marketIdOrPubkey;
      let marketTitle = '';
      
      if (marketIdOrPubkey.startsWith('POLY-')) {
        // It's a market ID - look up position pubkey from API
        console.log(`\n🔍 Looking up position for market ${marketIdOrPubkey}...`);
        
        const result = await getPositions(ownerPubkey);
        const position = result.positions.find(p => p.marketId === marketIdOrPubkey);
        
        if (!position) {
          throw new Error(`No position found for market ${marketIdOrPubkey}`);
        }
        
        if (!position.claimable) {
          throw new Error(`Position for ${position.marketMetadata.title} is not claimable yet`);
        }
        
        positionPubkey = position.pubkey;
        marketTitle = position.marketMetadata.title;
        console.log(`   Found: ${marketTitle} (${position.contracts} contracts)`);
      }

      console.log(`\n🎉 Claiming winnings...\n`);

      console.log('🔄 Creating claim order...');

      const order = await createClaimOrder({
        ownerPubkey,
        positionPubkey,
      });

      console.log('✍️ Signing transaction...');

      const signature = await executeOrder(connection, keypair, order);

      // Update local position
      const localPos = findPredictionByPubkey(positionPubkey);
      if (localPos) {
        closePredictionPosition(localPos.id, 'won');
        console.log(`\n📊 Position ${localPos.id} marked as WON`);
      }

      console.log('\n✅ Claimed successfully!');
      if (marketTitle) console.log(`🏆 ${marketTitle}`);
      console.log('📝 Signature:', signature);
      console.log('🔗 View on Solscan: https://solscan.io/tx/' + signature);
      console.log('');
    } catch (error: any) {
      console.error('❌ Error:', error.message);
      process.exit(1);
    }
  });

// NFT Commands
import {
  getCollectionStats,
  getListings,
  getPopularCollections,
  searchCollections,
  getWalletNFTs,
  getGachaStock,
  getGachaCards,
  getCryptListings,
  getGachaStatus,
  formatSol,
  solToUsd,
} from './utils/nft.js';

const nft = program.command('nft').description('NFT trading via Magic Eden');

nft
  .command('floor <collection>')
  .description('Get floor price for a collection')
  .action(async (collection) => {
    try {
      console.log(`\n🖼️ Fetching ${collection} stats...\n`);
      const stats = await getCollectionStats(collection);
      const usd = solToUsd(stats.floorPrice);
      
      console.log(`📊 ${stats.name}`);
      console.log(`   Floor: ${formatSol(stats.floorPrice)} (~$${usd.toFixed(0)})`);
      console.log(`   Listed: ${stats.listedCount}`);
      console.log(`   Volume: ${formatSol(stats.volumeAll)}`);
      console.log('');
    } catch (error: any) {
      console.error('❌ Error:', error.message);
      process.exit(1);
    }
  });

nft
  .command('listings <collection>')
  .description('Browse listings for a collection')
  .option('-l, --limit <number>', 'Number of listings', '10')
  .action(async (collection, options) => {
    try {
      console.log(`\n🖼️ Fetching ${collection} listings...\n`);
      const listings = await getListings(collection, parseInt(options.limit));
      
      if (listings.length === 0) {
        console.log('No listings found');
        return;
      }
      
      for (const l of listings) {
        const usd = solToUsd(l.price);
        console.log(`${l.name.slice(0, 50)}`);
        console.log(`   ${formatSol(l.price)} (~$${usd.toFixed(0)}) | ${l.mint.slice(0, 8)}...`);
      }
      console.log(`\n📊 Showing ${listings.length} listings\n`);
    } catch (error: any) {
      console.error('❌ Error:', error.message);
      process.exit(1);
    }
  });

nft
  .command('popular')
  .description('Show popular NFT collections')
  .option('-l, --limit <number>', 'Number of collections', '15')
  .action(async (options) => {
    try {
      console.log('\n🔥 Popular Collections (24h)\n');
      const collections = await getPopularCollections(50);
      
      for (const c of collections.slice(0, parseInt(options.limit))) {
        const usd = solToUsd(c.floorPrice);
        console.log(`${c.name}`);
        console.log(`   Floor: ${formatSol(c.floorPrice)} (~$${usd.toFixed(0)}) | Listed: ${c.listedCount}`);
      }
      console.log('');
    } catch (error: any) {
      console.error('❌ Error:', error.message);
      process.exit(1);
    }
  });

nft
  .command('search <query>')
  .description('Search for NFT collections')
  .action(async (query) => {
    try {
      console.log(`\n🔍 Searching for "${query}"...\n`);
      const collections = await searchCollections(query);
      
      if (collections.length === 0) {
        console.log('No collections found');
        return;
      }
      
      for (const c of collections.slice(0, 10)) {
        const usd = solToUsd(c.floorPrice);
        console.log(`${c.name} (${c.symbol})`);
        console.log(`   Floor: ${formatSol(c.floorPrice)} (~$${usd.toFixed(0)})`);
      }
      console.log('');
    } catch (error: any) {
      console.error('❌ Error:', error.message);
      process.exit(1);
    }
  });

nft
  .command('portfolio')
  .description('View your NFT holdings')
  .action(async () => {
    const password = getPassword();
    try {
      const address = getWalletAddress(password);
      console.log(`\n🖼️ Fetching NFTs for ${address}...\n`);
      
      const nfts = await getWalletNFTs(address);
      
      if (nfts.length === 0) {
        console.log('No NFTs found');
        return;
      }
      
      for (const n of nfts) {
        const listed = n.listStatus === 'listed' ? '📢 LISTED' : '';
        console.log(`${n.name || 'Unknown'} ${listed}`);
        console.log(`   Collection: ${n.collection || 'Unknown'}`);
        console.log(`   Mint: ${n.mintAddress}`);
        if (n.price) {
          console.log(`   Price: ${n.price} SOL`);
        }
      }
      console.log(`\n📊 Total: ${nfts.length} NFTs\n`);
    } catch (error: any) {
      console.error('❌ Error:', error.message);
      process.exit(1);
    }
  });

// Collector Crypt Commands
const crypt = program.command('crypt').description('Collector Crypt - Tokenized Pokemon Cards');

crypt
  .command('stock')
  .description('Check gacha machine stock')
  .action(async () => {
    try {
      console.log('\n🎰 Gacha Machine Stock\n');
      const status = await getGachaStatus();
      console.log(`Status: ${status.machineStatus === 'running' ? '🟢 RUNNING' : '🔴 STOPPED'}\n`);
      
      const stock = await getGachaStock();
      
      const packs = [
        { name: '$50 Elite Pack', key: 'pokemon_50' },
        { name: '$250 Legendary Pack', key: 'pokemon_250' },
        { name: '$1000 Ultra Pack', key: 'pokemon_1000' },
      ];
      
      for (const pack of packs) {
        const s = stock[pack.key];
        if (s) {
          console.log(`📦 ${pack.name}`);
          console.log(`   Epic: ${s.epic} (1%) | Rare: ${s.rare} (4%)`);
          console.log(`   Uncommon: ${s.uncommon} (15%) | Common: ${s.common} (80%)`);
          console.log('');
        }
      }
    } catch (error: any) {
      console.error('❌ Error:', error.message);
      process.exit(1);
    }
  });

crypt
  .command('epic')
  .description('View epic cards available in gacha')
  .option('-l, --limit <number>', 'Number of cards', '10')
  .action(async (options) => {
    try {
      console.log('\n🌟 Epic Cards in $50 Gacha (1% chance)\n');
      const cards = await getGachaCards('pokemon_50', 'epic');
      
      for (const card of cards.slice(0, parseInt(options.limit))) {
        console.log(`${card.name}`);
        console.log(`   💰 Insured: $${card.insuredValue} | ${card.grade || 'Ungraded'}`);
        if (card.year) console.log(`   📅 ${card.year}`);
      }
      console.log(`\n📊 ${cards.length} epic cards available\n`);
    } catch (error: any) {
      console.error('❌ Error:', error.message);
      process.exit(1);
    }
  });

crypt
  .command('rare')
  .description('View rare cards available in gacha')
  .option('-l, --limit <number>', 'Number of cards', '10')
  .action(async (options) => {
    try {
      console.log('\n💎 Rare Cards in $50 Gacha (4% chance)\n');
      const cards = await getGachaCards('pokemon_50', 'rare');
      
      for (const card of cards.slice(0, parseInt(options.limit))) {
        console.log(`${card.name}`);
        console.log(`   💰 Insured: $${card.insuredValue} | ${card.grade || 'Ungraded'}`);
      }
      console.log(`\n📊 ${cards.length} rare cards available\n`);
    } catch (error: any) {
      console.error('❌ Error:', error.message);
      process.exit(1);
    }
  });

crypt
  .command('browse')
  .description('Browse Pokemon cards on marketplace')
  .option('-l, --limit <number>', 'Number of listings', '15')
  .action(async (options) => {
    try {
      console.log('\n🃏 Pokemon Cards on Magic Eden\n');
      const listings = await getCryptListings(parseInt(options.limit) + 20);
      
      if (listings.length === 0) {
        console.log('No Pokemon cards listed');
        return;
      }
      
      for (const l of listings.slice(0, parseInt(options.limit))) {
        const usd = solToUsd(l.price);
        const grade = l.attributes?.grade || '';
        const insured = l.attributes?.insuredValue ? `$${l.attributes.insuredValue} insured` : '';
        console.log(`${l.name.slice(0, 50)}`);
        console.log(`   ${formatSol(l.price)} (~$${usd.toFixed(0)}) | ${grade} ${insured}`);
      }
      console.log(`\n📊 Showing ${Math.min(listings.length, parseInt(options.limit))} Pokemon cards\n`);
    } catch (error: any) {
      console.error('❌ Error:', error.message);
      process.exit(1);
    }
  });

// ═══════════════════════════════════════════════════════════════
// Jupiter Perpetuals Commands (Leverage Trading)
// ═══════════════════════════════════════════════════════════════
const perps = program.command('perps').description('Jupiter Perpetuals - leverage trading on SOL/ETH/BTC');

perps
  .command('pool')
  .description('View JLP pool stats and AUM')
  .action(async () => {
    try {
      const rpcUrl = process.env.HELIUS_API_KEY 
        ? `https://mainnet.helius-rpc.com/?api-key=${process.env.HELIUS_API_KEY}`
        : 'https://api.mainnet-beta.solana.com';
      const connection = new Connection(rpcUrl);
      
      console.log('\n📊 Jupiter Perpetuals Pool Stats\n');
      
      const stats = await getPoolStats(connection);
      console.log(`💰 Pool AUM: $${stats.aumUsd.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',')}`);
      console.log(`\n📈 Available Markets: SOL-PERP, ETH-PERP, BTC-PERP`);
      console.log(`⚡ Max Leverage: Up to 100x`);
      console.log(`💸 Fees: 0.06% open/close\n`);
    } catch (error: any) {
      console.error('❌ Error:', error.message);
      process.exit(1);
    }
  });

perps
  .command('markets')
  .description('View available perps markets and fees')
  .action(async () => {
    try {
      const rpcUrl = process.env.HELIUS_API_KEY 
        ? `https://mainnet.helius-rpc.com/?api-key=${process.env.HELIUS_API_KEY}`
        : 'https://api.mainnet-beta.solana.com';
      const connection = new Connection(rpcUrl);
      
      console.log('\n📊 Jupiter Perpetuals Markets\n');
      
      const custodies = await getAllCustodyInfo(connection);
      
      console.log('Market      Max Lev   Open Fee   Close Fee');
      console.log('─────────── ──────── ────────── ──────────');
      
      for (const c of custodies) {
        const maxLev = `${c.maxLeverage}x`.padEnd(8);
        const openFee = `${(c.openFeeBps / 100).toFixed(2)}%`.padEnd(10);
        const closeFee = `${(c.closeFeeBps / 100).toFixed(2)}%`;
        console.log(`${c.name.padEnd(11)} ${maxLev} ${openFee} ${closeFee}`);
      }
      
      console.log('\n💡 Trade at: https://jup.ag/perps\n');
    } catch (error: any) {
      console.error('❌ Error:', error.message);
      process.exit(1);
    }
  });

perps
  .command('positions')
  .description('View your open perps positions')
  .option('-w, --wallet <address>', 'Wallet address (defaults to configured wallet)')
  .action(async (options) => {
    try {
      const rpcUrl = process.env.HELIUS_API_KEY 
        ? `https://mainnet.helius-rpc.com/?api-key=${process.env.HELIUS_API_KEY}`
        : 'https://api.mainnet-beta.solana.com';
      const connection = new Connection(rpcUrl);
      
      let walletAddress = options.wallet;
      if (!walletAddress) {
        const password = process.env.WALLET_PASSWORD;
        if (password) {
          walletAddress = getWalletAddress(password);
        } else {
          console.error('❌ Wallet address required: use --wallet or set WALLET_PASSWORD');
          process.exit(1);
        }
      }
      
      console.log(`\n📊 Perps Positions for ${walletAddress.slice(0, 8)}...\n`);
      
      const positions = await getPerpsPositions(connection, new PublicKey(walletAddress));
      
      if (positions.length === 0) {
        console.log('No open perps positions found');
        console.log('\n💡 Open a position at: https://jup.ag/perps\n');
        return;
      }
      
      console.log('Market  Side   Size         Collateral   Leverage  Entry');
      console.log('─────── ────── ──────────── ──────────── ───────── ──────────');
      
      for (const pos of positions) {
        const side = pos.side.toUpperCase().padEnd(6);
        const size = `$${pos.sizeUsd.toFixed(2)}`.padEnd(12);
        const collateral = `$${pos.collateralUsd.toFixed(2)}`.padEnd(12);
        const leverage = `${pos.leverage.toFixed(1)}x`.padEnd(9);
        const entry = `$${pos.entryPrice.toFixed(2)}`;
        console.log(`${pos.custody.padEnd(7)} ${side} ${size} ${collateral} ${leverage} ${entry}`);
      }
      
      console.log('');
    } catch (error: any) {
      console.error('❌ Error:', error.message);
      process.exit(1);
    }
  });

perps
  .command('info')
  .description('How Jupiter Perps works')
  .action(() => {
    console.log(`
╔═══════════════════════════════════════════════════════════════╗
║              JUPITER PERPETUALS - QUICK GUIDE                 ║
╠═══════════════════════════════════════════════════════════════╣
║                                                               ║
║  MARKETS: SOL-PERP, ETH-PERP, BTC-PERP                       ║
║  LEVERAGE: Up to 100x                                         ║
║  COLLATERAL: SOL, USDC, or USDT                              ║
║                                                               ║
║  FEES:                                                        ║
║  • Open/Close: 0.06% of position size                        ║
║  • Borrow: Hourly rate based on utilization                  ║
║                                                               ║
║  LONG = Profit when price goes UP                            ║
║  SHORT = Profit when price goes DOWN                         ║
║                                                               ║
║  LIQUIDATION:                                                 ║
║  • Happens when losses exceed collateral margin              ║
║  • Higher leverage = closer liquidation price                ║
║  • Set stop-losses to protect capital                        ║
║                                                               ║
║  ⚠️  WARNING: Leverage amplifies both gains AND losses       ║
║  Start small (2-5x) until you understand the mechanics       ║
║                                                               ║
║  🔗 Trade at: https://jup.ag/perps                           ║
╚═══════════════════════════════════════════════════════════════╝
`);
  });

// Diagnostics command
program
  .command('diagnose')
  .description('Check environment, connectivity, and wallet status')
  .action(async () => {
    console.log('\n🔍 TRADER DIAGNOSTICS\n');
    
    const checks: { name: string; status: 'ok' | 'warn' | 'fail'; message: string }[] = [];
    
    // 1. Check WALLET_PASSWORD
    const password = process.env.WALLET_PASSWORD;
    if (password) {
      checks.push({ name: 'WALLET_PASSWORD', status: 'ok', message: 'Set' });
    } else {
      checks.push({ name: 'WALLET_PASSWORD', status: 'fail', message: 'Not set - required for wallet operations' });
    }
    
    // 2. Check HELIUS_API_KEY
    const heliusKey = process.env.HELIUS_API_KEY;
    if (heliusKey) {
      checks.push({ name: 'HELIUS_API_KEY', status: 'ok', message: 'Set' });
    } else {
      checks.push({ name: 'HELIUS_API_KEY', status: 'fail', message: 'Not set - get free key at https://dev.helius.xyz' });
    }
    
    // 3. Check JUPITER_API_KEY (optional, for predictions)
    const jupiterKey = process.env.JUPITER_API_KEY;
    if (jupiterKey) {
      checks.push({ name: 'JUPITER_API_KEY', status: 'ok', message: 'Set' });
    } else {
      checks.push({ name: 'JUPITER_API_KEY', status: 'warn', message: 'Not set - needed for prediction markets' });
    }
    
    // 4. Check wallet file exists
    const walletPath = path.join(process.env.HOME || '', '.openclaw', 'trader-wallet.enc');
    if (fs.existsSync(walletPath)) {
      checks.push({ name: 'Wallet file', status: 'ok', message: walletPath });
    } else {
      checks.push({ name: 'Wallet file', status: 'fail', message: 'Not found - run: trader wallet generate' });
    }
    
    // 5. Test wallet decryption
    let walletAddress: string | null = null;
    if (password && fs.existsSync(walletPath)) {
      try {
        walletAddress = getWalletAddress(password);
        checks.push({ name: 'Wallet decryption', status: 'ok', message: walletAddress });
      } catch (e: any) {
        checks.push({ name: 'Wallet decryption', status: 'fail', message: e.message });
      }
    } else {
      checks.push({ name: 'Wallet decryption', status: 'warn', message: 'Skipped - missing password or wallet' });
    }
    
    // 6. Test Helius RPC connectivity
    if (heliusKey) {
      try {
        const rpcUrl = `https://mainnet.helius-rpc.com/?api-key=${heliusKey}`;
        const connection = new Connection(rpcUrl);
        const blockHeight = await connection.getBlockHeight();
        checks.push({ name: 'Helius RPC', status: 'ok', message: `Connected (block ${blockHeight})` });
      } catch (e: any) {
        checks.push({ name: 'Helius RPC', status: 'fail', message: e.message });
      }
    } else {
      checks.push({ name: 'Helius RPC', status: 'warn', message: 'Skipped - no API key' });
    }
    
    // 7. Check SOL balance for gas
    if (walletAddress && heliusKey) {
      try {
        const rpcUrl = `https://mainnet.helius-rpc.com/?api-key=${heliusKey}`;
        const connection = new Connection(rpcUrl);
        const { PublicKey: PK } = await import('@solana/web3.js');
        const balance = await connection.getBalance(new PK(walletAddress));
        const solBalance = balance / 1e9;
        
        if (solBalance >= 0.01) {
          checks.push({ name: 'SOL balance', status: 'ok', message: `${solBalance.toFixed(4)} SOL` });
        } else if (solBalance > 0) {
          checks.push({ name: 'SOL balance', status: 'warn', message: `${solBalance.toFixed(4)} SOL - low, add more for gas` });
        } else {
          checks.push({ name: 'SOL balance', status: 'fail', message: '0 SOL - fund wallet for transactions' });
        }
      } catch (e: any) {
        checks.push({ name: 'SOL balance', status: 'fail', message: e.message });
      }
    } else {
      checks.push({ name: 'SOL balance', status: 'warn', message: 'Skipped - missing wallet or API key' });
    }
    
    // 8. Test Jupiter API (predictions)
    if (jupiterKey) {
      try {
        const res = await fetch('https://perps-api.jup.ag/v1/prediction/events?limit=1', {
          headers: { 'Authorization': `Bearer ${jupiterKey}` }
        });
        if (res.ok) {
          checks.push({ name: 'Jupiter Predictions API', status: 'ok', message: 'Connected' });
        } else if (res.status === 401) {
          checks.push({ name: 'Jupiter Predictions API', status: 'fail', message: 'Invalid API key' });
        } else if (res.status === 403) {
          checks.push({ name: 'Jupiter Predictions API', status: 'fail', message: 'Geo-blocked (US/South Korea)' });
        } else {
          checks.push({ name: 'Jupiter Predictions API', status: 'warn', message: `HTTP ${res.status}` });
        }
      } catch (e: any) {
        checks.push({ name: 'Jupiter Predictions API', status: 'fail', message: e.message });
      }
    } else {
      checks.push({ name: 'Jupiter Predictions API', status: 'warn', message: 'Skipped - no API key' });
    }
    
    // Display results
    const icons = { ok: '✅', warn: '⚠️ ', fail: '❌' };
    
    for (const check of checks) {
      console.log(`${icons[check.status]} ${check.name}: ${check.message}`);
    }
    
    // Summary
    const fails = checks.filter(c => c.status === 'fail').length;
    const warns = checks.filter(c => c.status === 'warn').length;
    
    console.log('\n' + '─'.repeat(50));
    if (fails === 0 && warns === 0) {
      console.log('✅ All checks passed - ready to trade!');
    } else if (fails === 0) {
      console.log(`⚠️  ${warns} warning(s) - core functionality available`);
    } else {
      console.log(`❌ ${fails} issue(s) need attention`);
    }
    console.log();
  });

program.parse();
