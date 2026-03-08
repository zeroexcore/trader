import { Connection } from '@solana/web3.js';
import { Command } from 'commander';
import Big from 'big.js';
import { getPortfolio } from '../utils/helius.js';
import { getWalletAddress } from '../utils/wallet.js';
import { getPositionStats } from '../utils/positions.js';
import { getPositions, microToUsd } from '../utils/prediction.js';
import { getPerpsPositions, rawToUsd, formatUsd } from '../utils/perps-api.js';
import { getRecurringOrders } from '../utils/recurring.js';
import { getTriggerOrders } from '../utils/trigger.js';
import { getTickerFromAddress } from '../utils/token-book.js';
import { output, action, requirePassword, getRpcUrl } from './shared.js';

export const portfolioCommand = new Command('portfolio')
  .description('Show portfolio: tokens, perps, predictions, DCA, limit orders, PnL')
  .action(action(async () => {
    const password = requirePassword();
    const address = getWalletAddress(password);
    const rpcUrl = getRpcUrl();
    const connection = new Connection(rpcUrl, 'confirmed');

    // Fetch everything in parallel
    const [onChain, predResult, perpsResult, dcaResult, limitResult] = await Promise.all([
      getPortfolio(address),
      getPositions(address).catch(() => ({ positions: [] as any[] })),
      getPerpsPositions(address, connection).catch(() => ({ dataList: [] as any[], count: 0 })),
      getRecurringOrders(address, 'active').catch(() => ({ orders: [] as any[] })),
      getTriggerOrders(address, 'active').catch(() => ({ orders: [] as any[] })),
    ]);

    const holdings = onChain.tokens.filter(t => t.valueUsd >= 0.01);

    // Prediction positions
    const predPositions = predResult.positions || [];
    let predTotalCost = Big(0);
    let predTotalValue = Big(0);
    let predTotalPnl = Big(0);
    for (const p of predPositions) {
      predTotalCost = predTotalCost.plus(microToUsd(p.totalCostUsd));
      predTotalValue = predTotalValue.plus(microToUsd(p.valueUsd));
      predTotalPnl = predTotalPnl.plus(microToUsd(p.pnlUsdAfterFees));
    }

    // Perps positions
    const perpsPositions = perpsResult.dataList || [];

    // DCA orders
    const dcaOrders = dcaResult.orders || [];

    // Limit orders
    const limitOrders = limitResult.orders || [];

    // Local journal stats (realized PnL from closed trades)
    const stats = getPositionStats();
    const totalPnl = stats.realizedPnl + predTotalPnl.toNumber();

    output(
      {
        address,
        onChain: { totalUsd: onChain.totalValueUsd, holdings },
        perps: { count: perpsPositions.length, positions: perpsPositions },
        predictions: {
          count: predPositions.length,
          costUsd: predTotalCost.toNumber(),
          valueUsd: predTotalValue.toNumber(),
          pnlUsd: predTotalPnl.toNumber(),
        },
        dca: { count: dcaOrders.length, orders: dcaOrders },
        limits: { count: limitOrders.length, orders: limitOrders },
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

        // Perps positions
        if (perpsPositions.length > 0) {
          lines.push(`Perps Positions: ${perpsPositions.length}`);
          for (const p of perpsPositions) {
            const size = formatUsd(p.sizeUsd);
            const entry = formatUsd(p.entryPriceUsd);
            const pnl = rawToUsd(p.pnlAfterFeesUsd);
            const pnlStr = `${pnl >= 0 ? '+' : ''}$${pnl.toFixed(2)}`;
            lines.push(`  ${(p.asset || '?').padEnd(4)} ${p.side.toUpperCase().padEnd(6)} ${size.padEnd(10)} @ ${entry}  ${p.leverage}x  ${pnlStr}`);
          }
          lines.push('');
        }

        // Prediction positions
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

        // DCA orders
        if (dcaOrders.length > 0) {
          lines.push(`DCA Orders: ${dcaOrders.length} active`);
          for (const o of dcaOrders) {
            const from = getTickerFromAddress(o.inputMint) || o.inputMint.slice(0, 6);
            const to = getTickerFromAddress(o.outputMint) || o.outputMint.slice(0, 6);
            lines.push(`  ${from} → ${to}  ${o.inAmountPerCycle} ${from}/cycle  Used: ${o.inUsed}/${o.inDeposited} ${from}`);
          }
          lines.push('');
        }

        // Limit orders
        if (limitOrders.length > 0) {
          lines.push(`Limit Orders: ${limitOrders.length} active`);
          for (const o of limitOrders) {
            const from = getTickerFromAddress(o.inputMint) || o.inputMint.slice(0, 6);
            const to = getTickerFromAddress(o.outputMint) || o.outputMint.slice(0, 6);
            lines.push(`  ${from} → ${to}  Sell ${o.makingAmount} ${from} for ${o.takingAmount} ${to}  (${o.status})`);
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
