#!/usr/bin/env node
import { Connection } from '@solana/web3.js';
import { Command } from 'commander';
import dotenv from 'dotenv';
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
  .version('1.0.0')
  .option('--md', 'Output as markdown (default is JSON)');

// Output helper - JSON by default, markdown with --md
function output(data: any, mdFormatter?: () => string): void {
  const opts = program.opts();
  if (opts.md && mdFormatter) {
    console.log(mdFormatter());
  } else {
    console.log(JSON.stringify(data, null, 2));
  }
}

// Error output
function error(message: string, details?: any): void {
  const opts = program.opts();
  if (opts.md) {
    console.error(`Error: ${message}`);
    if (details) console.error(details);
  } else {
    console.log(JSON.stringify({ error: message, details }, null, 2));
  }
  process.exit(1);
}

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
    error('WALLET_PASSWORD environment variable required');
    process.exit(1); // TypeScript needs this for control flow
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
      const address = publicKey.toBase58();
      output(
        { success: true, address, warning: 'Backup private key with: trader wallet export (run on server only)' },
        () => `Wallet generated: ${address}\n\nIMPORTANT: Run \`trader wallet export\` on server to backup private key.`
      );
    } catch (e: any) {
      error(e.message);
    }
  });

wallet
  .command('address')
  .description('Get wallet address (safe to share)')
  .action(async () => {
    const password = getPassword();
    try {
      const address = getWalletAddress(password);
      output({ address }, () => address);
    } catch (e: any) {
      error(e.message);
    }
  });

wallet
  .command('export')
  .description('Export private key for backup (KEEP SECRET!)')
  .action(async () => {
    const password = getPassword();
    try {
      const privateKey = await exportPrivateKey(password);
      output(
        { privateKey, warning: 'NEVER SHARE - import into Phantom/Solflare for recovery' },
        () => `Private Key (base58):\n${privateKey}\n\nImport into Phantom/Solflare for recovery.`
      );
    } catch (e: any) {
      error(e.message);
    }
  });

// Portfolio Commands
const portfolio = program
  .command('portfolio')
  .description('View portfolio balances and values');

portfolio
  .command('view')
  .description('View all token holdings with USD values')
  .action(async () => {
    const password = getPassword();
    const address = getWalletAddress(password);

    try {
      const data = await getPortfolio(address);
      const holdings = data.tokens.filter(t => t.valueUsd >= 0.01);
      
      output(
        { address, totalUsd: data.totalValueUsd, holdings },
        () => {
          let md = `# Portfolio\nAddress: ${address}\nTotal: $${data.totalValueUsd.toFixed(2)}\n\n`;
          for (const t of holdings) {
            md += `- ${t.symbol}: ${t.balance.toFixed(4)} @ $${t.pricePerToken.toFixed(2)} = $${t.valueUsd.toFixed(2)}\n`;
          }
          return md;
        }
      );
    } catch (e: any) {
      error(e.message);
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
      const pnl = await calculatePnL(address, mint);

      console.log(`PnL for ${mintOrTicker.toUpperCase()}`);
      console.log(`Bought: ${pnl.totalBought} | Sold: ${pnl.totalSold} | Holding: ${pnl.currentHolding}`);
      console.log(`Avg buy: $${pnl.avgPurchasePrice.toFixed(2)} | Current: $${pnl.currentPrice.toFixed(2)} (${pnl.priceChange >= 0 ? '+' : ''}${pnl.priceChange.toFixed(2)}%)`);
      console.log(`Cost basis: $${pnl.costBasis.toFixed(2)} | Value: $${pnl.currentValue.toFixed(2)}`);
      console.log(`Realized: $${pnl.realizedPnL.toFixed(2)} | Unrealized: $${pnl.unrealizedPnL.toFixed(2)} | Total: $${pnl.totalPnL.toFixed(2)}`);
    } catch (error: any) {
      console.error('Error:', error.message);
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
    const totalPnl = stats.realizedPnl + stats.unrealizedPnl;
    
    output(stats, () => {
      let md = `# Position Stats\n`;
      md += `Total: ${stats.totalPositions} (${stats.openPositions} open, ${stats.closedPositions} closed)\n`;
      md += `Open value: $${stats.currentOpenValue.toFixed(2)}\n`;
      md += `Unrealized PnL: $${stats.unrealizedPnl.toFixed(2)}\n`;
      md += `Realized PnL: $${stats.realizedPnl.toFixed(2)}\n`;
      md += `Total PnL: $${totalPnl.toFixed(2)}\n`;
      if (stats.closedPositions > 0) {
        md += `\nWin rate: ${stats.winRate.toFixed(1)}% (${stats.winCount}W/${stats.lossCount}L)\n`;
        md += `Avg win: $${stats.avgWin.toFixed(2)} | Avg loss: $${stats.avgLoss.toFixed(2)}\n`;
        if (stats.bestTrade) md += `Best: ${stats.bestTrade.symbol} +$${stats.bestTrade.pnl.toFixed(2)}\n`;
        if (stats.worstTrade) md += `Worst: ${stats.worstTrade.symbol} $${stats.worstTrade.pnl.toFixed(2)}\n`;
      }
      return md;
    });
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
  .action(async (options) => {
    const password = getPassword();
    const interval = parseInt(options.interval) * 1000;
    const address = getWalletAddress(password);
    
    console.log(`Watching positions (refresh every ${options.interval}s). Ctrl+C to stop.\n`);
    
    const fetchAndDisplay = async () => {
      try {
        const result = await getPositions(address);
        
        console.clear();
        console.log(`Positions - ${new Date().toLocaleTimeString()}\n`);
        
        if (!result.positions || result.positions.length === 0) {
          console.log('No open positions');
          return;
        }
        
        let totalValue = Big(0);
        let totalPnl = Big(0);
        let totalCost = Big(0);
        
        for (const pos of result.positions) {
          const title = pos.marketMetadata.title.substring(0, 25);
          const cost = microToUsd(pos.totalCostUsd);
          const avgPrice = microToUsd(pos.avgPriceUsd);
          const value = microToUsd(pos.valueUsd);
          const sellPrice = pos.sellPriceUsd != null ? microToUsd(pos.sellPriceUsd) : null;
          const pnl = microToUsd(pos.pnlUsdAfterFees);
          const payout = microToUsd(pos.payoutUsd);
          const marketStatus = pos.marketMetadata?.status || 'open';
          const marketResult = pos.marketMetadata?.result;
          
          const currentOdds = sellPrice ? sellPrice.toNumber() * 100 : 0;
          const entryOdds = avgPrice.toNumber() * 100;
          
          let status = 'OPEN';
          if (marketStatus === 'closed') {
            if (marketResult) {
              const won = (marketResult === 'yes' && pos.isYes) || (marketResult === 'no' && !pos.isYes);
              status = won ? 'WON' : 'LOST';
            } else {
              status = 'PENDING';
            }
          }
          if (pos.claimable) status = 'CLAIM';
          
          const pnlStr = `${pnl.gte(0) ? '+' : ''}$${pnl.toFixed(2)}`;
          const oddsStr = currentOdds > 0 ? `${currentOdds.toFixed(0)}%` : '-';
          
          console.log(`${title.padEnd(25)} ${status.padEnd(7)} ${oddsStr.padStart(4)}/${entryOdds.toFixed(0)}% ${pnlStr.padStart(8)} payout:$${payout.toFixed(2)}`);
          
          totalValue = totalValue.plus(value);
          totalPnl = totalPnl.plus(pnl);
          totalCost = totalCost.plus(cost);
        }
        
        console.log(`\nTotal: PnL ${totalPnl.gte(0) ? '+' : ''}$${totalPnl.toFixed(2)} | Cost $${totalCost.toFixed(2)} | Value $${totalValue.toFixed(2)}`);
        
        // Check for claimable
        const claimable = result.positions.filter((p: any) => p.claimable);
        if (claimable.length > 0) {
          console.log(`\n${claimable.length} position(s) ready to claim:`);
          for (const pos of claimable) {
            console.log(`  trader predict claim ${pos.pubkey}`);
          }
        }
      } catch (error: any) {
        console.error('Error:', error.message);
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
