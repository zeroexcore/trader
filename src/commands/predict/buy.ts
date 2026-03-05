import { Connection } from '@solana/web3.js';
import { Command } from 'commander';
import Big from 'big.js';
import { openPredictionPosition } from '../../utils/positions.js';
import { loadKeypairForSigning } from '../../utils/wallet.js';
import { getMarket, createOrder, executeOrder, microToUsd } from '../../utils/prediction.js';
import { getRpcUrl, requirePassword } from '../shared.js';

export const buyCommand = new Command('buy')
  .argument('<market-id>', 'Market ID')
  .argument('<side>', 'Side (yes/no)')
  .argument('<amount>', 'Amount in USD')
  .description('Buy YES or NO contracts')
  .option('--max-price <price>', 'Maximum price per contract in USD')
  .option('-n, --note <note>', 'Trading journal note')
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

      const actualContracts = parseInt(orderResponse.order.contracts);
      const orderCost = microToUsd(parseInt(orderResponse.order.orderCostUsd));
      const fees = microToUsd(parseInt(orderResponse.order.estimatedTotalFeeUsd));
      
      console.log(`   Actual contracts: ${actualContracts}`);
      console.log(`   Order cost: $${orderCost.toFixed(2)} (incl. $${fees.toFixed(2)} fees)`);

      console.log('✍️ Signing transaction...');
      const signature = await executeOrder(connection, keypair, orderResponse);

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
        notes: options.note,
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
