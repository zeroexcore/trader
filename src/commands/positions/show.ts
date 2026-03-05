import { Command } from 'commander';
import { getPosition } from '../../utils/positions.js';
import { output } from '../shared.js';

export const showCommand = new Command('show')
  .argument('<position-id>', 'Position ID')
  .description('Show details for a specific position')
  .action((positionId) => {
    const position = getPosition(positionId);
    if (position) {
      output(position, () => {
        let md = `# Position Details\n\n`;
        md += `**${position.tokenSymbol}** (${position.type.toUpperCase()})\n\n`;
        md += `- ID: ${position.id}\n`;
        md += `- Status: ${position.status}\n`;
        md += `- Entry: $${position.entryPrice} x ${position.entryAmount} = $${position.entryValueUsd.toFixed(2)}\n`;
        md += `- Date: ${position.entryDate}\n`;
        if (position.exitPrice) {
          md += `- Exit: $${position.exitPrice} x ${position.exitAmount} = $${position.exitValueUsd?.toFixed(2)}\n`;
          md += `- Exit Date: ${position.exitDate}\n`;
        }
        if (position.currentPrice) {
          md += `- Current Price: $${position.currentPrice} (updated: ${position.currentPriceUpdatedAt})\n`;
        }
        if (position.pnl !== undefined) {
          md += `- PnL: $${position.pnl.toFixed(2)} (${position.pnlPercent?.toFixed(2)}%)\n`;
        }
        if (position.targetPrice) md += `- Target: $${position.targetPrice}\n`;
        if (position.stopLoss) md += `- Stop: $${position.stopLoss}\n`;
        if (position.notes) md += `- Notes: ${position.notes}\n`;
        if (position.tags?.length) md += `- Tags: ${position.tags.join(', ')}\n`;
        if (position.entryTxSignature) md += `- Entry TX: ${position.entryTxSignature}\n`;
        if (position.exitTxSignature) md += `- Exit TX: ${position.exitTxSignature}\n`;
        return md;
      });
    } else {
      output({ error: 'Position not found', positionId }, () => `Error: Position not found: ${positionId}`);
    }
  });
