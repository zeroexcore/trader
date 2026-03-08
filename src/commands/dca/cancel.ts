import { Connection } from '@solana/web3.js';
import { Command } from 'commander';
import { loadKeypairForSigning } from '../../utils/wallet.js';
import { cancelDcaOrder, signAndExecuteDca } from '../../utils/recurring.js';
import { output, action, getRpcUrl, requirePassword } from '../shared.js';

export const cancelCommand = new Command('cancel')
  .argument('<order-pubkey>', 'Public key of the DCA order to cancel')
  .option('-n, --note <note>', 'Note for this cancellation')
  .description('Cancel an active DCA order')
  .action(action(async (orderPubkey, options) => {
    const password = requirePassword();
    const rpcUrl = getRpcUrl();
    const connection = new Connection(rpcUrl, 'confirmed');
    const keypair = loadKeypairForSigning(password);
    const user = keypair.publicKey.toBase58();

    console.log(`\n🗑️  Cancelling DCA order...`);
    console.log(`   Order: ${orderPubkey}`);
    if (options.note) console.log(`   Note: ${options.note}`);
    console.log('');

    const response = await cancelDcaOrder({
      order: orderPubkey,
      user,
      recurringType: 'time',
    });

    console.log('✍️  Signing transaction...');
    const result = await signAndExecuteDca(connection, keypair, response.transaction, response.requestId);

    const data = {
      requestId: response.requestId,
      order: orderPubkey,
      ...result,
    };

    output(data, () => {
      return [
        `\n✅ DCA order cancelled!`,
        `📝 Order: ${orderPubkey}`,
        `📝 Request ID: ${response.requestId}`,
        result.signature ? `📝 Signature: ${result.signature}` : '',
        result.signature ? `🔗 View on Solscan: https://solscan.io/tx/${result.signature}` : '',
        '',
      ].filter(Boolean).join('\n');
    });
  }));
