import { Connection } from '@solana/web3.js';
import { Command } from 'commander';
import { closePredictionPosition, findPredictionByMarket } from '../../utils/positions.js';
import { loadKeypairForSigning } from '../../utils/wallet.js';
import { getMarket, getPositions, closePredictionOrder, executeOrder, microToUsd } from '../../utils/prediction.js';
import { getRpcUrl, requirePassword } from '../shared.js';

export const closeCommand = new Command('close')
  .argument('<market-id>', 'Market ID')
  .description('Close entire position for a market')
  .option('-n, --note <note>', 'Trading journal note')
  .action(async (marketId, options) => {
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
