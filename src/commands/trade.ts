import { Connection } from '@solana/web3.js';
import { Command } from 'commander';
import Big from 'big.js';
import { getTokenDecimals, toSmallestUnit, fromSmallestUnit } from '../utils/amounts.js';
import { executeSwap, getSwapQuote, searchToken } from '../utils/jupiter.js';
import { resolveToken } from '../utils/token-book.js';
import { formatTokenInfo, getTokenInfo } from '../utils/token-info.js';
import { loadKeypairForSigning } from '../utils/wallet.js';
import { output, error, requirePassword, getRpcUrl } from './shared.js';

export function registerTradeCommands(program: Command): void {
  const trade = program.command('trade').description('Execute trades via Jupiter');

  trade
    .command('quote <input-mint> <output-mint> <amount>')
    .description('Get swap quote (amount in human-readable format, e.g., 400 for 400 USDC)')
    .option('-s, --slippage <bps>', 'Slippage in basis points', '50')
    .action(async (inputMintOrTicker, outputMintOrTicker, amount, options) => {
      const inputMint = resolveToken(inputMintOrTicker);
      const outputMint = resolveToken(outputMintOrTicker);
      try {
        const decimals = await getTokenDecimals(inputMint);
        const amountInSmallestUnit = toSmallestUnit(amount, decimals);

        const quote = await getSwapQuote({
          inputMint,
          outputMint,
          amount: parseInt(amountInSmallestUnit),
          slippageBps: parseInt(options.slippage),
        });

        const outputDecimals = await getTokenDecimals(outputMint);
        const outputAmount = fromSmallestUnit(quote.outAmount, outputDecimals);
        const price = new Big(amount).div(new Big(outputAmount));
        const priceImpact = typeof quote.priceImpactPct === 'string'
          ? new Big(quote.priceImpactPct).times(100)
          : new Big(quote.priceImpactPct).times(100);
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
          () => {
            const impactEmoji = impactNum < 0 ? '⚠️' : '✅';
            return [
              '📊 Swap Quote:',
              `  You pay: ${amount} ${inputMintOrTicker.toUpperCase()}`,
              `  You get: ~${new Big(outputAmount).toFixed(4)} ${outputMintOrTicker.toUpperCase()}`,
              `  Price: ${price.toFixed(6)} ${inputMintOrTicker.toUpperCase()} per ${outputMintOrTicker.toUpperCase()}`,
              `  Price Impact: ${impactEmoji} ${impactNum.toFixed(3)}% (${impactNum < 0 ? 'you lose value' : 'you gain value'})`,
              `  Slippage Tolerance: ${new Big(options.slippage).div(100).toFixed(2)}%`,
            ].join('\n');
          }
        );
      } catch (e: any) {
        error('Failed to get quote', e.message);
      }
    });

  trade
    .command('swap <input-mint> <output-mint> <amount>')
    .description('Execute swap (amount in human-readable format, e.g., 400 for 400 USDC)')
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

  // Token Search
  program
    .command('search <query>')
    .description('Search for token by name or symbol')
    .action(async (query) => {
      try {
        const tokens = await searchToken(query);

        output(
          { query, results: tokens.map((t) => ({ symbol: t.symbol, name: t.name, address: t.address })) },
          () => {
            const lines = ['🔍 Search Results:', ''];
            for (const t of tokens) {
              lines.push(`  ${t.symbol.padEnd(10)} ${t.name.slice(0, 30).padEnd(32)} ${t.address}`);
            }
            return lines.join('\n');
          }
        );
      } catch (e: any) {
        error('Search failed', e.message);
      }
    });

  // Token Info
  program
    .command('info <token>')
    .description('Get detailed token information by symbol or address')
    .action(async (tokenOrTicker) => {
      try {
        const tokenAddress = resolveToken(tokenOrTicker);
        const info = await getTokenInfo(tokenAddress);

        output(
          {
            ...info,
            explorers: {
              solscan: `https://solscan.io/token/${info.address}`,
              solanaExplorer: `https://explorer.solana.com/address/${info.address}`,
              dexscreener: info.markets?.[0]?.pair ? `https://dexscreener.com/solana/${info.markets[0].pair}` : null,
            },
          },
          () => {
            const formatted = formatTokenInfo(info);
            const links = [
              '',
              '🔗 EXPLORERS',
              `   Solscan: https://solscan.io/token/${info.address}`,
              `   Solana Explorer: https://explorer.solana.com/address/${info.address}`,
            ];
            if (info.markets && info.markets.length > 0) {
              links.push(`   DexScreener: https://dexscreener.com/solana/${info.markets[0].pair}`);
            }
            return formatted + links.join('\n');
          }
        );
      } catch (e: any) {
        error('Failed to get token info', e.message);
      }
    });
}
