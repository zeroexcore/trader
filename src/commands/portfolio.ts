import { Command } from 'commander';
import Big from 'big.js';
import { getPortfolio } from '../utils/helius.js';
import { getWalletAddress } from '../utils/wallet.js';
import { getPositionStats } from '../utils/positions.js';
import { getPositions, microToUsd } from '../utils/prediction.js';
import { output, action, requirePassword } from './shared.js';

export const portfolioCommand = new Command('portfolio')
  .description('Show portfolio: token holdings, prediction bets, and PnL summary')
  .action(action(async () => {
    const password = requirePassword();
    const address = getWalletAddress(password);

    // On-chain token holdings
    const onChain = await getPortfolio(address);
    const holdings = onChain.tokens.filter(t => t.valueUsd >= 0.01);

    // Live prediction positions from API
    let predPositions: any[] = [];
    let predTotalCost = Big(0);
    let predTotalValue = Big(0);
    let predTotalPnl = Big(0);
    try {
      const result = await getPositions(address);
      predPositions = result.positions || [];
      for (const p of predPositions) {
        predTotalCost = predTotalCost.plus(microToUsd(p.totalCostUsd));
        predTotalValue = predTotalValue.plus(microToUsd(p.valueUsd));
        predTotalPnl = predTotalPnl.plus(microToUsd(p.pnlUsdAfterFees));
      }
    } catch {
      // Prediction API unavailable — show what we have
    }

    // Local journal stats (realized PnL from closed trades)
    const stats = getPositionStats();
    const totalPnl = stats.realizedPnl + predTotalPnl.toNumber();

    output(
      {
        address,
        onChain: { totalUsd: onChain.totalValueUsd, holdings },
        predictions: {
          count: predPositions.length,
          costUsd: predTotalCost.toNumber(),
          valueUsd: predTotalValue.toNumber(),
          pnlUsd: predTotalPnl.toNumber(),
        },
        pnl: {
          realized: stats.realizedPnl,
          unrealized: predTotalPnl.toNumber(),
          total: totalPnl,
          winRate: stats.winRate,
          winCount: stats.winCount,
          lossCount: stats.lossCount,
        },
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

        // Prediction positions with PnL
        if (predPositions.length > 0) {
          lines.push(`Prediction Bets: ${predPositions.length} open (cost $${predTotalCost.toFixed(2)}, value $${predTotalValue.toFixed(2)})`);
          for (const p of predPositions) {
            const side = p.isYes ? 'YES' : 'NO';
            const pnl = microToUsd(p.pnlUsdAfterFees);
            const pnlPct = p.pnlUsdAfterFeesPercent ?? 0;
            const pnlStr = `${pnl.gte(0) ? '+' : ''}$${pnl.toFixed(2)} (${pnlPct >= 0 ? '+' : ''}${pnlPct.toFixed(0)}%)`;
            const claimable = p.claimable ? ' [CLAIM]' : '';
            const title = (p.marketMetadata?.title || p.marketId).slice(0, 28);
            lines.push(`  ${side} ${title.padEnd(30)} ${pnlStr}${claimable}`);
          }
          lines.push('');
        }

        // PnL summary
        const predPnl = predTotalPnl.toNumber();
        lines.push(`PnL Summary`);
        lines.push(`  Predictions: ${predPnl >= 0 ? '+' : ''}$${predPnl.toFixed(2)} (unrealized)`);
        lines.push(`  Realized:    ${stats.realizedPnl >= 0 ? '+' : ''}$${stats.realizedPnl.toFixed(2)} (closed trades)`);
        lines.push(`  Total:       ${totalPnl >= 0 ? '+' : ''}$${totalPnl.toFixed(2)}`);
        if (stats.closedPositions > 0) {
          lines.push(`  Win Rate:    ${stats.winRate.toFixed(0)}% (${stats.winCount}W/${stats.lossCount}L)`);
        }

        return lines.join('\n');
      }
    );
  }));
