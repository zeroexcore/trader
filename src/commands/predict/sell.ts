import { Connection } from '@solana/web3.js';
import { Command } from 'commander';
import { closePredictionPosition, findPredictionByMarket } from '../../utils/positions.js';
import { loadKeypairForSigning } from '../../utils/wallet.js';
import { getMarket, createSellOrder, executeOrder, microToUsd } from '../../utils/prediction.js';
import { getRpcUrl, requirePassword } from '../shared.js';

export const sellCommand = new Command('sell')
  .argument('<market-id>', 'Market ID')
  .argument('<side>', 'Side (yes/no)')
  .argument('<contracts>', 'Number of contracts to sell')
  .description('Sell contracts to close position')
  .option('-l, --limit <price>', 'Minimum sell price (limit order)')
  .option('-n, --note <note>', 'Trading journal note')
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

      const localPos = findPredictionByMarket(marketId, isYes ? 'yes' : 'no');
      if (localPos && localPos.prediction?.contracts === numContracts) {
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
