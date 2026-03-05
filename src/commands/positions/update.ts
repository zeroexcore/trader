import { Command } from 'commander';
import { updatePositionPrices } from '../../utils/positions.js';
import { output } from '../shared.js';

export const updateCommand = new Command('update')
  .description('Update current prices for all open positions')
  .action(async () => {
    try {
      const results = await updatePositionPrices();

      if (results.length === 0) {
        output({ message: 'No open positions to update', updated: 0 }, () => 'No open positions to update.');
        return;
      }

      const totalUnrealizedPnl = results.reduce((sum, r) => sum + r.unrealizedPnl, 0);

      output(
        {
          updated: results.length,
          totalUnrealizedPnl,
          positions: results,
        },
        () => {
          let md = `# Prices Updated\n\n`;
          md += `Updated ${results.length} position(s)\n\n`;
          for (const r of results) {
            const pnlSign = r.unrealizedPnl >= 0 ? '+' : '';
            md += `- **${r.tokenSymbol}**: $${r.currentPrice.toFixed(4)} (entry: $${r.entryPrice.toFixed(4)}, PnL: ${pnlSign}$${r.unrealizedPnl.toFixed(2)})\n`;
          }
          const emoji = totalUnrealizedPnl >= 0 ? '+' : '';
          md += `\n**Total Unrealized PnL:** ${emoji}$${totalUnrealizedPnl.toFixed(2)}\n`;
          return md;
        }
      );
    } catch (error: any) {
      output({ error: error.message }, () => `Error: ${error.message}`);
      process.exit(1);
    }
  });
