import { Connection } from '@solana/web3.js';
import { Command } from 'commander';
import { loadKeypairForSigning } from '../../utils/wallet.js';
import { resolveToken, getTickerFromAddress } from '../../utils/token-book.js';
import { toSmallestUnit, getTokenDecimals } from '../../utils/amounts.js';
import { createDcaOrder, signAndExecuteDca } from '../../utils/recurring.js';
import { output, action, getRpcUrl, requirePassword } from '../shared.js';

export const createCommand = new Command('create')
  .argument('<from>', 'Input token (ticker or mint address, e.g. USDC)')
  .argument('<to>', 'Output token (ticker or mint address, e.g. SOL)')
  .argument('<total-amount>', 'Total amount of input token to spend')
  .argument('<num-orders>', 'Number of orders (min 2)')
  .option('--interval <seconds>', 'Seconds between orders', '86400')
  .option('-n, --note <note>', 'Note for this DCA order')
  .description('Create a DCA (dollar-cost averaging) order')
  .action(action(async (from, to, totalAmount, numOrders, options) => {
    const password = requirePassword();
    const rpcUrl = getRpcUrl();
    const connection = new Connection(rpcUrl, 'confirmed');
    const keypair = loadKeypairForSigning(password);
    const user = keypair.publicKey.toBase58();

    const inputMint = resolveToken(from);
    const outputMint = resolveToken(to);
    const numberOfOrders = parseInt(numOrders, 10);
    const interval = parseInt(options.interval, 10);
    const amount = parseFloat(totalAmount);

    if (isNaN(amount) || amount <= 0) {
      throw new Error(`Invalid amount: "${totalAmount}". Must be a positive number.`);
    }
    if (isNaN(numberOfOrders) || numberOfOrders < 2) {
      throw new Error(`Number of orders must be at least 2, got "${numOrders}".`);
    }
    if (isNaN(interval) || interval <= 0) {
      throw new Error(`Invalid interval: "${options.interval}". Must be positive seconds.`);
    }

    const decimals = await getTokenDecimals(inputMint);
    const inAmount = toSmallestUnit(totalAmount, decimals);
    const amountPerOrder = (amount / numberOfOrders).toFixed(decimals);

    const fromTicker = getTickerFromAddress(inputMint) || inputMint.slice(0, 8) + '...';
    const toTicker = getTickerFromAddress(outputMint) || outputMint.slice(0, 8) + '...';
    const intervalHours = interval / 3600;

    console.log(`\n📊 DCA Order Summary\n`);
    console.log(`   From: ${fromTicker} (${inputMint})`);
    console.log(`   To:   ${toTicker} (${outputMint})`);
    console.log(`   Total: ${amount} ${fromTicker}`);
    console.log(`   Orders: ${numberOfOrders} x ${amountPerOrder} ${fromTicker}`);
    console.log(`   Interval: ${intervalHours >= 24 ? `${intervalHours / 24}d` : `${intervalHours}h`} (${interval}s)`);
    if (options.note) console.log(`   Note: ${options.note}`);
    console.log('');

    console.log('🔄 Creating DCA order...');
    const response = await createDcaOrder({
      user,
      inputMint,
      outputMint,
      params: {
        time: {
          inAmount: parseInt(inAmount, 10),
          numberOfOrders,
          interval,
          minPrice: null,
          maxPrice: null,
          startAt: null,
        },
      },
    });

    console.log('✍️  Signing transaction...');
    const result = await signAndExecuteDca(connection, keypair, response.transaction, response.requestId);

    const data = {
      requestId: response.requestId,
      inputMint,
      outputMint,
      totalAmount: amount,
      numberOfOrders,
      interval,
      ...result,
    };

    output(data, () => {
      return [
        `\n✅ DCA order created!`,
        `📝 Request ID: ${response.requestId}`,
        result.signature ? `📝 Signature: ${result.signature}` : '',
        result.signature ? `🔗 View on Solscan: https://solscan.io/tx/${result.signature}` : '',
        '',
      ].filter(Boolean).join('\n');
    });
  }));
