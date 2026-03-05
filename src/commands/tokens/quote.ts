import { Command } from 'commander';
import Big from 'big.js';
import { getTokenDecimals, toSmallestUnit, fromSmallestUnit } from '../../utils/amounts.js';
import { getSwapQuote } from '../../utils/jupiter.js';
import { resolveToken } from '../../utils/token-book.js';
import { output, error } from '../shared.js';

export const quoteCommand = new Command('quote')
  .argument('<input-mint>', 'Input token symbol or address')
  .argument('<output-mint>', 'Output token symbol or address')
  .argument('<amount>', 'Amount in human-readable format')
  .description('Get swap quote')
  .option('-s, --slippage <bps>', 'Slippage in basis points', '50')
  .action(async (inputMintOrTicker, outputMintOrTicker, amount, options) => {
    const inputMint = resolveToken(inputMintOrTicker);
    const outputMint = resolveToken(outputMintOrTicker);
    try {
      const decimals = await getTokenDecimals(inputMint);
      const amountInSmallestUnit = toSmallestUnit(amount, decimals);

      const quote = await getSwapQuote({
        inputMint, outputMint,
        amount: parseInt(amountInSmallestUnit),
        slippageBps: parseInt(options.slippage),
      });

      const outputDecimals = await getTokenDecimals(outputMint);
      const outputAmount = fromSmallestUnit(quote.outAmount, outputDecimals);
      const price = new Big(amount).div(new Big(outputAmount));
      const priceImpact = new Big(quote.priceImpactPct).times(100);
      const impactNum = parseFloat(priceImpact.toFixed(3));

      output(
        {
          inputToken: inputMintOrTicker.toUpperCase(),
          inputAmount: amount,
          outputToken: outputMintOrTicker.toUpperCase(),
          outputAmount: new Big(outputAmount).toFixed(6),
          price: price.toFixed(6),
          priceImpactPct: impactNum,
          slippageBps: parseInt(options.slippage),
        },
        () => [
          `Swap Quote:`,
          `  Pay: ${amount} ${inputMintOrTicker.toUpperCase()}`,
          `  Get: ~${new Big(outputAmount).toFixed(4)} ${outputMintOrTicker.toUpperCase()}`,
          `  Price: ${price.toFixed(6)} ${inputMintOrTicker.toUpperCase()} per ${outputMintOrTicker.toUpperCase()}`,
          `  Impact: ${impactNum.toFixed(3)}%`,
          `  Slippage: ${new Big(options.slippage).div(100).toFixed(2)}%`,
        ].join('\n')
      );
    } catch (e: any) {
      error('Failed to get quote', e.message);
    }
  });
