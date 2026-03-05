import { Connection } from '@solana/web3.js';
import { Command } from 'commander';
import { closePredictionPosition, findPredictionByPubkey } from '../../utils/positions.js';
import { loadKeypairForSigning } from '../../utils/wallet.js';
import { getPositions, createClaimOrder, executeOrder } from '../../utils/prediction.js';
import { getRpcUrl, requirePassword } from '../shared.js';

export const claimCommand = new Command('claim')
  .argument('<market-id-or-pubkey>', 'Market ID or position pubkey')
  .description('Claim winnings from a resolved position')
  .action(async (marketIdOrPubkey) => {
    const password = requirePassword();

    try {
      const rpcUrl = getRpcUrl();
      const connection = new Connection(rpcUrl, 'confirmed');
      const keypair = loadKeypairForSigning(password);
      const ownerPubkey = keypair.publicKey.toBase58();

      let positionPubkey = marketIdOrPubkey;
      let marketTitle = '';
      
      if (marketIdOrPubkey.startsWith('POLY-')) {
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

      const order = await createClaimOrder({
        ownerPubkey,
        positionPubkey,
      });

      console.log('✍️ Signing transaction...');
      const signature = await executeOrder(connection, keypair, order);

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
