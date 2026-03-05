import { Command } from 'commander';
import { openPosition } from '../../utils/positions.js';
import { resolveToken } from '../../utils/token-book.js';
import { output } from '../shared.js';

export const openCommand = new Command('open')
  .argument('<type>', 'Position type (long/short)')
  .argument('<token>', 'Token symbol or address')
  .argument('<amount>', 'Entry amount')
  .argument('<price>', 'Entry price')
  .description('Open a new position')
  .option('-t, --target <price>', 'Target price')
  .option('-s, --stop <price>', 'Stop loss price')
  .option('-n, --notes <notes>', 'Position notes')
  .option('--tags <tags>', 'Comma-separated tags')
  .option('--tx <signature>', 'Entry transaction signature')
  .action((type, tokenOrTicker, amount, price, options) => {
    const token = resolveToken(tokenOrTicker);
    const tags = options.tags ? options.tags.split(',').map((t: string) => t.trim()) : undefined;

    const position = openPosition({
      type: type.toLowerCase() as 'long' | 'short',
      token,
      tokenSymbol: tokenOrTicker.toUpperCase(),
      entryPrice: parseFloat(price),
      entryAmount: parseFloat(amount),
      targetPrice: options.target ? parseFloat(options.target) : undefined,
      stopLoss: options.stop ? parseFloat(options.stop) : undefined,
      notes: options.notes,
      tags,
      entryTxSignature: options.tx,
    });

    output(position, () => {
      let md = `# Position Opened\n\n`;
      md += `**${position.tokenSymbol}** (${position.type.toUpperCase()})\n\n`;
      md += `- ID: ${position.id}\n`;
      md += `- Entry: $${position.entryPrice} x ${position.entryAmount} = $${position.entryValueUsd.toFixed(2)}\n`;
      if (position.targetPrice) md += `- Target: $${position.targetPrice}\n`;
      if (position.stopLoss) md += `- Stop: $${position.stopLoss}\n`;
      if (position.notes) md += `- Notes: ${position.notes}\n`;
      if (position.tags?.length) md += `- Tags: ${position.tags.join(', ')}\n`;
      return md;
    });
  });
