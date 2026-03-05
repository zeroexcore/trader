import { Command } from 'commander';
import { getPortfolio } from '../utils/helius.js';
import { getWalletAddress } from '../utils/wallet.js';
import { getPositionStats, getOpenPositions } from '../utils/positions.js';
import { output, action, requirePassword } from './shared.js';

export const portfolioCommand = new Command('portfolio')
  .description('Aggregate view: tokens, predictions, PnL')
  .action(action(async () => {
    const password = requirePassword();
    const address = getWalletAddress(password);

    // On-chain token holdings
    const onChain = await getPortfolio(address);
    const holdings = onChain.tokens.filter(t => t.valueUsd >= 0.01);

    // Local position journal
    const stats = getPositionStats();
    const openPositions = getOpenPositions();
    const predictions = openPositions.filter(p => p.type === 'prediction');
    const tokenPositions = openPositions.filter(p => p.type !== 'prediction');

    const totalPnl = stats.realizedPnl + stats.unrealizedPnl;

    output(
      {
        address,
        onChain: { totalUsd: onChain.totalValueUsd, holdings },
        positions: { open: openPositions.length, predictions: predictions.length, tokens: tokenPositions.length },
        stats: { realizedPnl: stats.realizedPnl, unrealizedPnl: stats.unrealizedPnl, totalPnl, winRate: stats.winRate },
      },
      () => {
        const lines: string[] = [];

        lines.push(`Portfolio — ${address.slice(0, 8)}...`);
        lines.push('');

        // Token holdings
        lines.push(`Token Holdings: $${onChain.totalValueUsd.toFixed(2)}`);
        for (const t of holdings) {
          lines.push(`  ${t.symbol.padEnd(8)} ${t.balance.toFixed(4).padStart(12)} = $${t.valueUsd.toFixed(2).padStart(10)}`);
        }
        lines.push('');

        // Prediction positions
        if (predictions.length > 0) {
          const predValue = predictions.reduce((s, p) => s + p.entryValueUsd, 0);
          lines.push(`Prediction Bets: ${predictions.length} open ($${predValue.toFixed(2)} deployed)`);
          for (const p of predictions) {
            lines.push(`  ${p.tokenSymbol.slice(0, 35).padEnd(37)} $${p.entryValueUsd.toFixed(2)}`);
          }
          lines.push('');
        }

        // PnL summary
        lines.push(`PnL Summary`);
        lines.push(`  Realized:   ${stats.realizedPnl >= 0 ? '+' : ''}$${stats.realizedPnl.toFixed(2)}`);
        lines.push(`  Unrealized: ${stats.unrealizedPnl >= 0 ? '+' : ''}$${stats.unrealizedPnl.toFixed(2)}`);
        lines.push(`  Total:      ${totalPnl >= 0 ? '+' : ''}$${totalPnl.toFixed(2)}`);
        if (stats.closedPositions > 0) {
          lines.push(`  Win Rate:   ${stats.winRate.toFixed(0)}% (${stats.winCount}W/${stats.lossCount}L)`);
        }

        return lines.join('\n');
      }
    );
  }));
