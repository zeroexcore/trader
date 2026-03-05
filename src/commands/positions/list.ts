import { Command } from 'commander';
import { calculateTotalPnL, getAllPositions, getOpenPositions } from '../../utils/positions.js';
import { output } from '../shared.js';

export const listCommand = new Command('list')
  .description('List all open positions')
  .option('-a, --all', 'Show all positions including closed')
  .action((options) => {
    const pos = options.all ? getAllPositions() : getOpenPositions();
    
    output(pos, () => {
      if (pos.length === 0) {
        return '# Positions\n\nNo positions found.';
      }
      
      let md = '# Positions\n\n';
      for (const p of pos) {
        md += `## ${p.tokenSymbol} (${p.type.toUpperCase()})\n`;
        md += `- ID: ${p.id}\n`;
        md += `- Status: ${p.status}\n`;
        md += `- Entry: $${p.entryPrice} x ${p.entryAmount} = $${p.entryValueUsd.toFixed(2)}\n`;
        if (p.exitPrice) {
          md += `- Exit: $${p.exitPrice} x ${p.exitAmount} = $${p.exitValueUsd?.toFixed(2)}\n`;
        }
        if (p.pnl !== undefined) {
          md += `- PnL: $${p.pnl.toFixed(2)} (${p.pnlPercent?.toFixed(2)}%)\n`;
        }
        if (p.notes) md += `- Notes: ${p.notes}\n`;
        if (p.tags?.length) md += `- Tags: ${p.tags.join(', ')}\n`;
        md += '\n';
      }
      
      if (options.all) {
        const { realized, count } = calculateTotalPnL();
        md += `---\n\n**Total Realized PnL:** $${realized.toFixed(2)} from ${count} closed positions\n`;
      }
      
      return md;
    });
  });
