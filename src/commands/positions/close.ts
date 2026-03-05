import { Command } from 'commander';
import { closePosition } from '../../utils/positions.js';
import { output } from '../shared.js';

export const closeCommand = new Command('close')
  .argument('<position-id>', 'Position ID')
  .argument('<exit-price>', 'Exit price')
  .argument('<exit-amount>', 'Exit amount')
  .description('Close an open position')
  .option('-n, --notes <notes>', 'Exit notes')
  .option('--tx <signature>', 'Exit transaction signature')
  .action((positionId, exitPrice, exitAmount, options) => {
    const position = closePosition(
      positionId,
      parseFloat(exitPrice),
      parseFloat(exitAmount),
      {
        exitTxSignature: options.tx,
        notes: options.notes,
      }
    );

    if (position) {
      output(position, () => {
        let md = `# Position Closed\n\n`;
        md += `**${position.tokenSymbol}** (${position.type.toUpperCase()})\n\n`;
        md += `- ID: ${position.id}\n`;
        md += `- Entry: $${position.entryPrice} x ${position.entryAmount} = $${position.entryValueUsd.toFixed(2)}\n`;
        md += `- Exit: $${position.exitPrice} x ${position.exitAmount} = $${position.exitValueUsd?.toFixed(2)}\n`;
        md += `- PnL: $${position.pnl?.toFixed(2)} (${position.pnlPercent?.toFixed(2)}%)\n`;
        return md;
      });
    } else {
      output({ error: 'Position not found', positionId }, () => `Error: Position not found: ${positionId}`);
    }
  });
