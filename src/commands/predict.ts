import { Connection } from '@solana/web3.js';
import { Command } from 'commander';
import Big from 'big.js';
import {
  closePredictionPosition,
  findPredictionByMarket,
  findPredictionByPubkey,
  openPredictionPosition,
} from '../utils/positions.js';
import { getWalletAddress, loadKeypairForSigning } from '../utils/wallet.js';
import {
  listEvents,
  searchEvents,
  getMarket,
  getPositions,
  createOrder,
  createSellOrder,
  closePredictionOrder,
  executeOrder,
  createClaimOrder,
  microToUsd,
} from '../utils/prediction.js';
import { getRpcUrl, requirePassword } from './shared.js';

export function registerPredictCommands(program: Command): void {
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

        console.log(`\n💡 To bet: trader predict buy ${marketId} <yes|no> <amount>`);
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
      const password = requirePassword();

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
      const password = requirePassword();

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
            console.log(`   🎉 CLAIMABLE NOW! Run: trader predict claim ${pos.marketId}`);
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
      const password = requirePassword();
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
      const password = requirePassword();

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
      const password = requirePassword();

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
      const password = requirePassword();

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
}
