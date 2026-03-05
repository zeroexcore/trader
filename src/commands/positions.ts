import { Command } from 'commander';
import {
  calculateTotalPnL,
  closePosition,
  displayPositions,
  getAllPositions,
  getOpenPositions,
  getPosition,
  getPositionStats,
  openPosition,
  updatePositionPrices,
  updatePositionNotes,
  addPositionTags,
  getPositionsByTag,
} from '../utils/positions.js';
import { resolveToken } from '../utils/token-book.js';
import { output } from './shared.js';

export function registerPositionsCommands(program: Command): void {
  const positions = program.command('positions').description('Track trading positions');

  positions
    .command('list')
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
      
      // Display summary for markdown mode
      if (program.opts().md && options.all) {
        // Summary included in formatter
      } else if (!program.opts().md && options.all) {
        const { realized, count } = calculateTotalPnL();
        console.log(`\nTotal Realized PnL: $${realized.toFixed(2)} from ${count} closed positions\n`);
      }
    });

  positions
    .command('open <type> <token> <amount> <price>')
    .description('Open a new position (type: long/short)')
    .option('-t, --target <price>', 'Target price')
    .option('-s, --stop <price>', 'Stop loss price')
    .option('-n, --notes <notes>', 'Position notes')
    .option('--tags <tags>', 'Comma-separated tags (e.g., "swing,momentum")')
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

  positions
    .command('close <position-id> <exit-price> <exit-amount>')
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

  positions
    .command('note <position-id> <note>')
    .description('Add a note to a position')
    .option('-a, --append', 'Append to existing notes instead of replacing')
    .action((positionId, note, options) => {
      updatePositionNotes(positionId, note, options.append);
      const position = getPosition(positionId);
      if (position) {
        output(
          { positionId, notes: position.notes },
          () => `# Note Updated\n\nPosition: ${positionId}\nNotes: ${position.notes}`
        );
      } else {
        output({ error: 'Position not found', positionId }, () => `Error: Position not found: ${positionId}`);
      }
    });

  positions
    .command('tag <position-id> <tags>')
    .description('Add tags to a position (comma-separated)')
    .action((positionId, tags) => {
      const tagList = tags.split(',').map((t: string) => t.trim());
      addPositionTags(positionId, tagList);
      const position = getPosition(positionId);
      if (position) {
        output(
          { positionId, tags: position.tags },
          () => `# Tags Updated\n\nPosition: ${positionId}\nTags: ${position.tags?.join(', ')}`
        );
      } else {
        output({ error: 'Position not found', positionId }, () => `Error: Position not found: ${positionId}`);
      }
    });

  positions
    .command('show <position-id>')
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

  positions
    .command('filter <tag>')
    .description('List positions by tag')
    .action((tag) => {
      const pos = getPositionsByTag(tag);
      output(pos, () => {
        if (pos.length === 0) {
          return `# Positions by Tag\n\nNo positions found with tag: ${tag}`;
        }
        let md = `# Positions with tag "${tag}"\n\n`;
        for (const p of pos) {
          md += `- **${p.tokenSymbol}** (${p.type}): $${p.entryValueUsd.toFixed(2)} - ${p.status}\n`;
        }
        return md;
      });
    });

  positions
    .command('stats')
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

  positions
    .command('update')
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
}
