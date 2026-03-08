import { Connection } from '@solana/web3.js';
import { Command } from 'commander';
import Big from 'big.js';
import { loadKeypairForSigning } from '../../utils/wallet.js';
import { resolveToken, getTickerFromAddress } from '../../utils/token-book.js';
import { toSmallestUnit, getTokenDecimals } from '../../utils/amounts.js';
import { createLimitOrder, signAndExecuteTrigger } from '../../utils/trigger.js';
import { action, getRpcUrl, requirePassword } from '../shared.js';

export const createCommand = new Command('create')
  .argument('<sell-token>', 'Token to sell (ticker or mint address)')
  .argument('<buy-token>', 'Token to buy (ticker or mint address)')
  .argument('<sell-amount>', 'Amount of sell token (human readable)')
  .argument('<buy-amount>', 'Amount of buy token to receive (human readable)')
  .option('--expires <seconds>', 'Expiry in seconds from now')
  .option('-n, --note <note>', 'Note for the order')
  .description('Create a limit order')
  .action(action(async (sellToken, buyToken, sellAmount, buyAmount, options) => {
    const password = requirePassword();
    const rpcUrl = getRpcUrl();
    const connection = new Connection(rpcUrl, 'confirmed');
    const keypair = loadKeypairForSigning(password);
    const maker = keypair.publicKey.toBase58();

    const inputMint = resolveToken(sellToken);
    const outputMint = resolveToken(buyToken);

    const sellTicker = getTickerFromAddress(inputMint) || sellToken;
    const buyTicker = getTickerFromAddress(outputMint) || buyToken;

    console.log(`\n🔮 Creating limit order...\n`);

    const [inputDecimals, outputDecimals] = await Promise.all([
      getTokenDecimals(inputMint),
      getTokenDecimals(outputMint),
    ]);

    const makingAmount = toSmallestUnit(sellAmount, inputDecimals);
    const takingAmount = toSmallestUnit(buyAmount, outputDecimals);

    const sellBig = new Big(sellAmount);
    const buyBig = new Big(buyAmount);
    const limitPrice = buyBig.div(sellBig);
    const inversePrice = sellBig.div(buyBig);

    console.log(`📊 Limit Order Summary:`);
    console.log(`   Sell: ${sellBig.toFixed()} ${sellTicker}`);
    console.log(`   Buy:  ${buyBig.toFixed()} ${buyTicker}`);
    console.log(`   Price: 1 ${sellTicker} = ${limitPrice.toFixed(6)} ${buyTicker}`);
    console.log(`          1 ${buyTicker} = ${inversePrice.toFixed(6)} ${sellTicker}`);
    if (options.expires) {
      const mins = Math.round(parseInt(options.expires) / 60);
      console.log(`   Expires: ${options.expires}s (${mins}m)`);
    }
    console.log('');

    console.log('🔄 Creating order...');

    const expiredAt = options.expires
      ? String(Math.floor(Date.now() / 1000) + parseInt(options.expires))
      : undefined;

    const response = await createLimitOrder({
      inputMint,
      outputMint,
      maker,
      makingAmount,
      takingAmount,
      expiredAt,
    });

    console.log('✍️  Signing transaction...');
    const signature = await signAndExecuteTrigger(connection, keypair, response.transaction, response.requestId);

    console.log('\n✅ Limit order placed!');
    console.log(`📝 Order: ${response.order}`);
    console.log(`📝 Signature: ${signature}`);
    console.log(`🔗 View on Solscan: https://solscan.io/tx/${signature}`);
    console.log('');
  }));
