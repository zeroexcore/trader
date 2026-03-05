import { Connection } from '@solana/web3.js';
import { Command } from 'commander';
import Big from 'big.js';
import { getTokenDecimals, toSmallestUnit } from '../../utils/amounts.js';
import { executeSwap, getSwapQuote } from '../../utils/jupiter.js';
import { resolveToken, getTickerFromAddress } from '../../utils/token-book.js';
import { loadKeypairForSigning } from '../../utils/wallet.js';
import { openPosition } from '../../utils/positions.js';
import { output, error, requirePassword, getRpcUrl } from '../shared.js';

export const swapCommand = new Command('swap')
  .argument('<input-mint>', 'Input token symbol or address')
  .argument('<output-mint>', 'Output token symbol or address')
  .argument('<amount>', 'Amount in human-readable format')
  .description('Execute swap')
  .option('-s, --slippage <bps>', 'Slippage in basis points', '50')
  .option('--priority-fee <lamports>', 'Priority fee in lamports')
  .option('-n, --note <note>', 'Trading journal note')
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
        inputMint, outputMint,
        amount: parseInt(amountInSmallestUnit),
        slippageBps: parseInt(options.slippage),
        taker: keypair.publicKey.toBase58(),
      });

      const outputDecimals = await getTokenDecimals(outputMint);
      const outputAmount = parseFloat(quote.outAmount) / Math.pow(10, outputDecimals);
      const price = parseFloat(amount) / outputAmount;
      const priceImpact = new Big(quote.priceImpactPct).times(100);
      const impactNum = parseFloat(priceImpact.toFixed(3));

      const signature = await executeSwap(
        connection, keypair, quote,
        options.priorityFee ? parseInt(options.priorityFee) : undefined
      );

      // Auto-record position in journal
      const outputTicker = outputMintOrTicker.length > 32
        ? getTickerFromAddress(outputMintOrTicker) || outputMintOrTicker.slice(0, 8)
        : outputMintOrTicker.toUpperCase();

      openPosition({
        type: 'long',
        token: outputMint,
        tokenSymbol: outputTicker,
        entryPrice: price,
        entryAmount: outputAmount,
        notes: options.note,
        entryTxSignature: signature,
      });

      output(
        {
          success: true,
          inputToken: inputMintOrTicker.toUpperCase(),
          inputAmount: amount,
          outputToken: outputTicker,
          outputAmount: outputAmount.toFixed(6),
          price: price.toFixed(6),
          priceImpactPct: impactNum,
          signature,
          explorer: `https://solscan.io/tx/${signature}`,
        },
        () => [
          `Swap Executed:`,
          `  Paid: ${amount} ${inputMintOrTicker.toUpperCase()}`,
          `  Got: ~${outputAmount.toFixed(4)} ${outputTicker}`,
          `  Price: ${price.toFixed(6)}`,
          `  Impact: ${impactNum.toFixed(3)}%`,
          `  Sig: ${signature}`,
          `  https://solscan.io/tx/${signature}`,
        ].join('\n')
      );
    } catch (e: any) {
      error('Swap failed', e.message);
    }
  });
