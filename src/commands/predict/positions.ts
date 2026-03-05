import { Command } from 'commander';
import Big from 'big.js';
import { getWalletAddress } from '../../utils/wallet.js';
import { getPositions, microToUsd } from '../../utils/prediction.js';
import { requirePassword } from '../shared.js';

export const positionsCommand = new Command('positions')
  .description('View your prediction market positions')
  .option('-a, --all', 'Show all positions including closed')
  .action(async (options) => {
    const password = requirePassword();

    try {
      const address = getWalletAddress(password);
      console.log(`\n🔮 Fetching prediction positions for ${address}...\n`);

      const result = await getPositions(address, {
        status: options.all ? 'all' : 'open',
      });

      if (!result.positions || result.positions.length === 0) {
        console.log('📊 No positions found');
        return;
      }

      let totalValue = Big(0);
      let totalPnl = Big(0);

      for (const pos of result.positions) {
        const side = pos.isYes ? 'YES' : 'NO';
        const sideEmoji = pos.isYes ? '🟢' : '🔴';
        const pnl = microToUsd(pos.pnlUsdAfterFees);
        const pnlEmoji = pnl.gte(0) ? '💰' : '💸';
        const cost = microToUsd(pos.totalCostUsd);
        const avgPrice = microToUsd(pos.avgPriceUsd);
        const value = microToUsd(pos.valueUsd);
        const sellPrice = pos.sellPriceUsd != null ? microToUsd(pos.sellPriceUsd) : null;
        const payout = microToUsd(pos.payoutUsd);
        const marketStatus = pos.marketMetadata?.status || 'unknown';
        const marketResult = pos.marketMetadata?.result;

        console.log(`${sideEmoji} ${side} Position - ${pos.marketMetadata.title}`);
        console.log(`   Market: ${pos.marketId} (${pos.eventMetadata.title})`);
        console.log(`   Contracts: ${pos.contracts}`);
        console.log(`   Cost: $${cost.toFixed(2)} (avg $${avgPrice.toFixed(2)}/contract)`);
        
        const pnlPct = pos.pnlUsdAfterFeesPercent ?? 0;
        if (marketStatus === 'closed') {
          const won = (marketResult === 'yes' && pos.isYes) || (marketResult === 'no' && !pos.isYes);
          const resultStr = marketResult ? marketResult.toUpperCase() : 'PENDING';
          console.log(`   Status: CLOSED - Result: ${resultStr} ${marketResult ? (won ? '✅ WON' : '❌ LOST') : '⏳'}`);
          console.log(`   ${pnlEmoji} PnL: ${pnl.gte(0) ? '+' : ''}$${pnl.toFixed(2)} (${pnlPct >= 0 ? '+' : ''}${pnlPct.toFixed(1)}%)`);
          if (won) {
            console.log(`   💵 Payout: $${payout.toFixed(2)}`);
          }
        } else {
          console.log(`   Value: $${value.toFixed(2)}${sellPrice ? ` (sell @ $${sellPrice.toFixed(2)})` : ''}`);
          console.log(`   ${pnlEmoji} PnL: ${pnl.gte(0) ? '+' : ''}$${pnl.toFixed(2)} (${pnlPct >= 0 ? '+' : ''}${pnlPct.toFixed(1)}%)`);
          console.log(`   Payout if ${side}: $${payout.toFixed(2)}`);
        }

        if (pos.claimable) {
          console.log(`   🎉 CLAIMABLE NOW! Run: trader predict claim ${pos.marketId}`);
        }

        totalValue = totalValue.plus(value);
        totalPnl = totalPnl.plus(pnl);
        console.log('');
      }

      console.log(`═══════════════════════════════════════`);
      const totalPnlEmoji = totalPnl.gte(0) ? '💰' : '💸';
      console.log(`📊 Total Value: $${totalValue.toFixed(2)}`);
      console.log(`${totalPnlEmoji} Total PnL: ${totalPnl.gte(0) ? '+' : ''}$${totalPnl.toFixed(2)}\n`);
    } catch (error: any) {
      console.error('❌ Error:', error.message);
      process.exit(1);
    }
  });
