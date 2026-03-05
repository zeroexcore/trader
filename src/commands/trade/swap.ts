import { Connection } from '@solana/web3.js';
import { Command } from 'commander';
import Big from 'big.js';
import { getTokenDecimals, toSmallestUnit } from '../../utils/amounts.js';
import { executeSwap, getSwapQuote } from '../../utils/jupiter.js';
import { resolveToken } from '../../utils/token-book.js';
import { loadKeypairForSigning } from '../../utils/wallet.js';
import { output, error, requirePassword, getRpcUrl } from '../shared.js';

export const swapCommand = new Command('swap')
  .argument('<input-mint>', 'Input token symbol or address')
  .argument('<output-mint>', 'Output token symbol or address')
  .argument('<amount>', 'Amount in human-readable format')
  .description('Execute swap')
  .option('-s, --slippage <bps>', 'Slippage in basis points', '50')
  .option('--priority-fee <lamports>', 'Priority fee in lamports')
  .action(async (inputMintOrTicker, outputMintOrTicker, amount, options) => {
    const inputMint = resolveToken(inputMintOrTicker);
    const outputMint = resolveToken(outputMintOrTicker);
    const password = requirePassword();

    try {
      const rpcUrl = getRpcUrl();
      const connection = new Connection(rpcUrl, 'confirmed');
      const keypair = loadKeypairForSigning(password);

      const decimals = await getTokenDecimals(inputMint);
      const amountInSmallestUnit = toSmallestUnit(parseFloat(amount), decimals);

      const quote = await getSwapQuote({
        inputMint,
        outputMint,
        amount: parseInt(amountInSmallestUnit),
        slippageBps: parseInt(options.slippage),
        taker: keypair.publicKey.toBase58(),
      });

      const outputDecimals = await getTokenDecimals(outputMint);
      const outputAmount = parseFloat(quote.outAmount) / Math.pow(10, outputDecimals);
      const price = parseFloat(amount) / outputAmount;
      const priceImpact = typeof quote.priceImpactPct === 'string'
        ? new Big(quote.priceImpactPct).times(100)
        : new Big(quote.priceImpactPct).times(100);
      const impactNum = parseFloat(priceImpact.toFixed(3));

      const signature = await executeSwap(
        connection,
        keypair,
        quote,
        options.priorityFee ? parseInt(options.priorityFee) : undefined
      );

      output(
        {
          success: true,
          inputToken: inputMintOrTicker.toUpperCase(),
          inputAmount: amount,
          outputToken: outputMintOrTicker.toUpperCase(),
          outputAmount: outputAmount.toFixed(6),
          price: price.toFixed(6),
          priceImpactPct: impactNum,
          signature,
          explorer: `https://solscan.io/tx/${signature}`,
        },
        () => {
          const impactEmoji = impactNum < 0 ? '⚠️' : '✅';
          return [
            '🔄 Swap Executed:',
            `  You paid: ${amount} ${inputMintOrTicker.toUpperCase()}`,
            `  You got: ~${outputAmount.toFixed(4)} ${outputMintOrTicker.toUpperCase()}`,
            `  Price: ${price.toFixed(6)} ${inputMintOrTicker.toUpperCase()} per ${outputMintOrTicker.toUpperCase()}`,
            `  Price Impact: ${impactEmoji} ${impactNum.toFixed(3)}%`,
            '',
            '✅ Swap successful!',
            `📝 Signature: ${signature}`,
            `🔗 View on Solscan: https://solscan.io/tx/${signature}`,
          ].join('\n');
        }
      );
    } catch (e: any) {
      error('Swap failed', e.message);
    }
  });
