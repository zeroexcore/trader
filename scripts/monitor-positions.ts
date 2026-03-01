#!/usr/bin/env tsx
/**
 * Automated Position Monitor
 * 
 * Runs every 5 minutes via cron to:
 * 1. Check open positions
 * 2. Get current SOL price
 * 3. Auto-execute trades if target/stop-loss hit
 * 4. Log results
 */

import { Connection } from '@solana/web3.js';
import dotenv from 'dotenv';
import { getOpenPositions, closePosition } from '../src/utils/positions.js';
import { getPortfolio } from '../src/utils/helius.js';
import { getSwapQuote, executeSwap } from '../src/utils/jupiter.js';
import { loadKeypairForSigning, getWalletAddress } from '../src/utils/wallet.js';
import { getTokenDecimals, toSmallestUnit } from '../src/utils/amounts.js';
import fs from 'fs';
import path from 'path';

dotenv.config();

const LOG_FILE = path.join(process.cwd(), 'monitor.log');

function log(message: string) {
  const timestamp = new Date().toISOString();
  const logMessage = `[${timestamp}] ${message}`;
  console.log(logMessage);
  fs.appendFileSync(LOG_FILE, logMessage + '\n');
}

async function main() {
  try {
    log('🔍 Starting position monitor...');

    const password = process.env.WALLET_PASSWORD;
    if (!password) {
      throw new Error('WALLET_PASSWORD not set');
    }

    const address = getWalletAddress(password);
    log(`📍 Monitoring wallet: ${address}`);

    // Get open positions
    const openPositions = getOpenPositions();
    log(`📊 Open positions: ${openPositions.length}`);

    if (openPositions.length === 0) {
      log('✅ No open positions to monitor');
      return;
    }

    // Get current portfolio/prices
    const portfolio = await getPortfolio(address);
    log(`💰 Portfolio value: $${portfolio.totalValueUsd.toFixed(2)}`);

    // Check each position
    for (const position of openPositions) {
      log(`\n📈 Checking position: ${position.tokenSymbol} ${position.type.toUpperCase()}`);
      log(`   Entry: $${position.entryPrice} × ${position.entryAmount}`);
      log(`   Target: $${position.targetPrice || 'N/A'}, Stop: $${position.stopLoss || 'N/A'}`);

      // Find token in portfolio
      const token = portfolio.tokens.find(t => t.mint === position.token);
      if (!token) {
        log(`   ⚠️  Token not found in portfolio`);
        continue;
      }

      const currentPrice = token.pricePerToken;
      log(`   Current price: $${currentPrice.toFixed(2)}`);

      // Calculate unrealized PnL
      const currentValue = position.entryAmount * currentPrice;
      const unrealizedPnL = currentValue - position.entryValueUsd;
      const pnlPercent = (unrealizedPnL / position.entryValueUsd) * 100;
      log(`   Unrealized PnL: $${unrealizedPnL.toFixed(2)} (${pnlPercent.toFixed(2)}%)`);

      // Check if should exit
      let shouldExit = false;
      let exitReason = '';

      if (position.targetPrice && currentPrice >= position.targetPrice) {
        shouldExit = true;
        exitReason = `🎯 TARGET HIT: $${currentPrice.toFixed(2)} >= $${position.targetPrice}`;
      } else if (position.stopLoss && currentPrice <= position.stopLoss) {
        shouldExit = true;
        exitReason = `🛑 STOP LOSS HIT: $${currentPrice.toFixed(2)} <= $${position.stopLoss}`;
      }

      if (shouldExit) {
        log(`\n${exitReason}`);
        log(`🔄 Executing exit trade...`);

        try {
          // Execute sell
          const rpcUrl = process.env.RPC_URL;
          if (!rpcUrl) {
            throw new Error('RPC_URL not set');
          }

          const connection = new Connection(rpcUrl, 'confirmed');
          const keypair = loadKeypairForSigning(password);

          // Determine output mint (sell to USDC for longs, buy from USDC for shorts)
          const outputMint = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v'; // USDC
          const inputMint = position.token;

          // Convert amount to smallest unit
          const decimals = await getTokenDecimals(inputMint);
          const amountInSmallestUnit = toSmallestUnit(position.entryAmount, decimals);

          // Get quote
          log(`   Getting quote for ${position.entryAmount} ${position.tokenSymbol} → USDC...`);
          const quote = await getSwapQuote({
            inputMint,
            outputMint,
            amount: parseInt(amountInSmallestUnit),
            slippageBps: 50,
            taker: keypair.publicKey.toBase58(),
          });

          log(`   Quote: ${quote.inAmount} → ${quote.outAmount} (impact: ${quote.priceImpactPct}%)`);

          // Execute swap
          const signature = await executeSwap(connection, keypair, quote);
          log(`   ✅ Swap executed: ${signature}`);
          log(`   🔗 https://solscan.io/tx/${signature}`);

          // Close position
          const closedPosition = closePosition(position.id, currentPrice, position.entryAmount);
          if (closedPosition) {
            log(`   ✅ Position closed with PnL: $${closedPosition.pnl?.toFixed(2)}`);
          }

          // Send notification (optional - could add email/telegram/discord)
          log(`\n🎉 TRADE COMPLETED:`);
          log(`   ${position.tokenSymbol} ${position.type.toUpperCase()}`);
          log(`   Entry: $${position.entryPrice}`);
          log(`   Exit: $${currentPrice.toFixed(2)}`);
          log(`   PnL: $${closedPosition?.pnl?.toFixed(2)} (${pnlPercent.toFixed(2)}%)`);

        } catch (error: any) {
          log(`   ❌ Error executing exit: ${error.message}`);
          log(`   Stack: ${error.stack}`);
        }
      } else {
        log(`   ✅ No action needed (price within range)`);
      }
    }

    log('\n✅ Monitor run completed\n');

  } catch (error: any) {
    log(`❌ Monitor error: ${error.message}`);
    log(`Stack: ${error.stack}`);
    process.exit(1);
  }
}

// Run the monitor
main();
