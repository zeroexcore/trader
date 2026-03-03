#!/usr/bin/env tsx
import { Connection } from '@solana/web3.js';
import { Command } from 'commander';
import dotenv from 'dotenv';
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
  displayPositions,
  getAllPositions,
  getOpenPositions,
  openPosition,
  updatePositionPrices
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

dotenv.config();

const program = new Command();

program
  .name('openclaw-trader')
  .description('Solana trading CLI for OpenClaw - Manage RWA tokens and crypto assets')
  .version('1.0.0');

// Wallet Management Commands
const wallet = program.command('wallet').description('Wallet management commands');

wallet
  .command('generate')
  .description('Generate a new encrypted wallet (ONE TIME ONLY)')
  .option('-p, --password <password>', 'Encryption password')
  .action(async (options) => {
    const password = options.password || process.env.WALLET_PASSWORD;
    if (!password) {
      console.error('❌ Password required: use --password or set WALLET_PASSWORD env var');
      process.exit(1);
    }

    try {
      const publicKey = generateWallet(password);
      console.log('\n✅ Wallet generated successfully');
      console.log('📍 Address:', publicKey.toBase58());
      console.log('\n⚠️  IMPORTANT SECURITY NOTES:');
      console.log('   • Store your password securely - it cannot be recovered');
      console.log('   • Never share your password or private key');
      console.log('   • Agent should ONLY use public address for operations');
    } catch (error: any) {
      console.error('❌ Error:', error.message);
      process.exit(1);
    }
  });

wallet
  .command('address')
  .description('Get wallet address (safe to share)')
  .option('-p, --password <password>', 'Encryption password')
  .action(async (options) => {
    const password = options.password || process.env.WALLET_PASSWORD;
    if (!password) {
      console.error('❌ Password required');
      process.exit(1);
    }

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
  .option('-p, --password <password>', 'Encryption password')
  .action(async (options) => {
    const password = options.password || process.env.WALLET_PASSWORD;
    if (!password) {
      console.error('❌ Password required');
      process.exit(1);
    }

    try {
      const privateKey = exportPrivateKey(password);
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

portfolio
  .command('view')
  .description('View all token holdings with USD values')
  .option('-p, --password <password>', 'Wallet password')
  .action(async (options) => {
    const password = options.password || process.env.WALLET_PASSWORD;
    if (!password) {
      console.error('❌ Password required');
      process.exit(1);
    }

    try {
      const address = getWalletAddress(password);
      console.log('📊 Fetching portfolio for:', address, '\n');

      const data = await getPortfolio(address);

      console.log('💰 Total Portfolio Value: $' + data.totalValueUsd.toFixed(2));
      console.log('\n📈 Holdings:\n');

      console.table(
        data.tokens.map((t) => ({
          Symbol: t.symbol,
          Name: t.name,
          Balance: t.balance.toFixed(4),
          'Price (USD)': '$' + t.pricePerToken.toFixed(2),
          'Value (USD)': '$' + t.valueUsd.toFixed(2),
        }))
      );
    } catch (error: any) {
      console.error('❌ Error:', error.message);
      process.exit(1);
    }
  });

portfolio
  .command('pnl <mint>')
  .description('Calculate PnL for a specific token (use ticker or address)')
  .option('-p, --password <password>', 'Wallet password')
  .action(async (mintOrTicker, options) => {
    const mint = resolveToken(mintOrTicker);
    const password = options.password || process.env.WALLET_PASSWORD;
    if (!password) {
      console.error('❌ Password required');
      process.exit(1);
    }

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
  .option('-p, --password <password>', 'Wallet password')
  .option('-s, --slippage <bps>', 'Slippage in basis points', '50')
  .option('--priority-fee <lamports>', 'Priority fee in lamports')
  .action(async (inputMintOrTicker, outputMintOrTicker, amount, options) => {
    const inputMint = resolveToken(inputMintOrTicker);
    const outputMint = resolveToken(outputMintOrTicker);
    const password = options.password || process.env.WALLET_PASSWORD;
    if (!password) {
      console.error('❌ Password required');
      process.exit(1);
    }

    try {
      const rpcUrl = process.env.RPC_URL;
      if (!rpcUrl) {
        throw new Error('RPC_URL not set in environment');
      }

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
  .action((type, tokenOrTicker, amount, price, options) => {
    const token = resolveToken(tokenOrTicker);

    const position = openPosition({
      type: type.toLowerCase() as 'long' | 'short',
      token,
      tokenSymbol: tokenOrTicker.toUpperCase(),
      entryPrice: parseFloat(price),
      entryAmount: parseFloat(amount),
      targetPrice: options.target ? parseFloat(options.target) : undefined,
      stopLoss: options.stop ? parseFloat(options.stop) : undefined,
      notes: options.notes,
    });

    console.log(`\n✅ Opened ${type.toUpperCase()} position:`);
    displayPositions([position]);
  });

positions
  .command('close <position-id> <exit-price> <exit-amount>')
  .description('Close an open position')
  .action((positionId, exitPrice, exitAmount) => {
    const position = closePosition(positionId, parseFloat(exitPrice), parseFloat(exitAmount));

    if (position) {
      console.log(`\n✅ Closed position:`);
      displayPositions([position]);
    }
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

program.parse();
