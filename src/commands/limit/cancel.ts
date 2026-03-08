import { Connection } from '@solana/web3.js';
import { Command } from 'commander';
import { loadKeypairForSigning } from '../../utils/wallet.js';
import { cancelLimitOrder, cancelLimitOrders, signAndExecuteTrigger } from '../../utils/trigger.js';
import { action, getRpcUrl, requirePassword } from '../shared.js';

export const cancelCommand = new Command('cancel')
  .argument('[order-pubkey]', 'Order public key to cancel')
  .option('--all', 'Cancel all open limit orders')
  .description('Cancel limit order(s)')
  .action(action(async (orderPubkey, options) => {
    if (!orderPubkey && !options.all) {
      throw new Error('Provide an order public key or use --all to cancel all orders');
    }

    const password = requirePassword();
    const rpcUrl = getRpcUrl();
    const connection = new Connection(rpcUrl, 'confirmed');
    const keypair = loadKeypairForSigning(password);
    const maker = keypair.publicKey.toBase58();

    if (options.all) {
      console.log(`\n🔮 Cancelling ALL limit orders...\n`);

      const response = await cancelLimitOrders({ maker, orders: [] });

      if (response.transactions.length === 0) {
        console.log('📊 No open orders to cancel');
        return;
      }

      console.log(`✍️  Signing ${response.transactions.length} transaction(s)...`);

      for (let i = 0; i < response.transactions.length; i++) {
        const sig = await signAndExecuteTrigger(connection, keypair, response.transactions[i], response.requestId);
        console.log(`✅ [${i + 1}/${response.transactions.length}] ${sig}`);
      }

      console.log(`\n✅ All orders cancelled!`);
      console.log('');
    } else {
      console.log(`\n🔮 Cancelling order ${orderPubkey}...\n`);

      const response = await cancelLimitOrder({ maker, order: orderPubkey });

      console.log('✍️  Signing transaction...');
      const signature = await signAndExecuteTrigger(connection, keypair, response.transaction, response.requestId);

      console.log('\n✅ Order cancelled!');
      console.log(`📝 Signature: ${signature}`);
      console.log(`🔗 View on Solscan: https://solscan.io/tx/${signature}`);
      console.log('');
    }
  }));
