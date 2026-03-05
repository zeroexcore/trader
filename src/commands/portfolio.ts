import { Command } from 'commander';
import { getPortfolio, calculatePnL } from '../utils/helius.js';
import { resolveToken } from '../utils/token-book.js';
import { output, error, requirePassword } from './shared.js';
import { getWalletAddress } from '../utils/wallet.js';

export const portfolioCommand = new Command('portfolio').description('View portfolio balances and values');

portfolioCommand
  .command('view')
  .description('View all token holdings with USD values')
  .action(async () => {
    const password = requirePassword();
    const address = getWalletAddress(password);

    try {
      const data = await getPortfolio(address);
      const holdings = data.tokens.filter(t => t.valueUsd >= 0.01);

      output(
        { address, totalUsd: data.totalValueUsd, holdings },
        () => {
          let md = `# Portfolio\nAddress: ${address}\nTotal: $${data.totalValueUsd.toFixed(2)}\n\n`;
          for (const t of holdings) {
            md += `- ${t.symbol}: ${t.balance.toFixed(4)} @ $${t.pricePerToken.toFixed(2)} = $${t.valueUsd.toFixed(2)}\n`;
          }
          return md;
        }
      );
    } catch (e: any) {
      error(e.message);
    }
  });

portfolioCommand
  .command('pnl <mint>')
  .description('Calculate PnL for a specific token (use ticker or address)')
  .action(async (mintOrTicker) => {
    const mint = resolveToken(mintOrTicker);
    const password = requirePassword();

    try {
      const address = getWalletAddress(password);
      const pnl = await calculatePnL(address, mint);

      output(
        {
          mint,
          ticker: mintOrTicker.toUpperCase(),
          totalBought: pnl.totalBought,
          totalSold: pnl.totalSold,
          currentHolding: pnl.currentHolding,
          avgPurchasePrice: pnl.avgPurchasePrice,
          currentPrice: pnl.currentPrice,
          priceChange: pnl.priceChange,
          costBasis: pnl.costBasis,
          currentValue: pnl.currentValue,
          realizedPnL: pnl.realizedPnL,
          unrealizedPnL: pnl.unrealizedPnL,
          totalPnL: pnl.totalPnL,
        },
        () => {
          let md = `# PnL for ${mintOrTicker.toUpperCase()}\n\n`;
          md += `**Bought:** ${pnl.totalBought} | **Sold:** ${pnl.totalSold} | **Holding:** ${pnl.currentHolding}\n\n`;
          md += `**Avg buy:** $${pnl.avgPurchasePrice.toFixed(2)} | **Current:** $${pnl.currentPrice.toFixed(2)} (${pnl.priceChange >= 0 ? '+' : ''}${pnl.priceChange.toFixed(2)}%)\n\n`;
          md += `**Cost basis:** $${pnl.costBasis.toFixed(2)} | **Value:** $${pnl.currentValue.toFixed(2)}\n\n`;
          md += `**Realized:** $${pnl.realizedPnL.toFixed(2)} | **Unrealized:** $${pnl.unrealizedPnL.toFixed(2)} | **Total:** $${pnl.totalPnL.toFixed(2)}\n`;
          return md;
        }
      );
    } catch (e: any) {
      error(e.message);
    }
  });
