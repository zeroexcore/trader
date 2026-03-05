import { Command } from 'commander';
import { getPositionStats } from '../../utils/positions.js';
import { output } from '../shared.js';

export const statsCommand = new Command('stats')
  .description('Show position statistics and performance')
  .action(() => {
    const stats = getPositionStats();
    const totalPnl = stats.realizedPnl + stats.unrealizedPnl;

    output(stats, () => {
      let md = `# Position Stats\n\n`;
      md += `Total: ${stats.totalPositions} (${stats.openPositions} open, ${stats.closedPositions} closed)\n`;
      md += `Open value: $${stats.currentOpenValue.toFixed(2)}\n`;
      md += `Unrealized PnL: $${stats.unrealizedPnl.toFixed(2)}\n`;
      md += `Realized PnL: $${stats.realizedPnl.toFixed(2)}\n`;
      md += `Total PnL: $${totalPnl.toFixed(2)}\n`;
      if (stats.closedPositions > 0) {
        md += `\nWin rate: ${stats.winRate.toFixed(1)}% (${stats.winCount}W/${stats.lossCount}L)\n`;
        md += `Avg win: $${stats.avgWin.toFixed(2)} | Avg loss: $${stats.avgLoss.toFixed(2)}\n`;
        if (stats.bestTrade) md += `Best: ${stats.bestTrade.symbol} +$${stats.bestTrade.pnl.toFixed(2)}\n`;
        if (stats.worstTrade) md += `Worst: ${stats.worstTrade.symbol} $${stats.worstTrade.pnl.toFixed(2)}\n`;
      }
      return md;
    });
  });
