import { Command } from 'commander';
import Big from 'big.js';
import { getWalletAddress } from '../../utils/wallet.js';
import { getPositions, microToUsd } from '../../utils/prediction.js';
import { requirePassword } from '../shared.js';

export const watchCommand = new Command('watch')
  .description('Watch positions with live odds and PnL updates')
  .option('-i, --interval <seconds>', 'Refresh interval in seconds', '30')
  .action(async (options) => {
    const password = requirePassword();
    const interval = parseInt(options.interval) * 1000;
    const address = getWalletAddress(password);
    
    console.log(`Watching positions (refresh every ${options.interval}s). Ctrl+C to stop.\n`);
    
    const fetchAndDisplay = async () => {
      try {
        const result = await getPositions(address);
        
        console.clear();
        console.log(`Positions - ${new Date().toLocaleTimeString()}\n`);
        
        if (!result.positions || result.positions.length === 0) {
          console.log('No open positions');
          return;
        }
        
        let totalValue = Big(0);
        let totalPnl = Big(0);
        let totalCost = Big(0);
        
        for (const pos of result.positions) {
          const title = pos.marketMetadata.title.substring(0, 25);
          const cost = microToUsd(pos.totalCostUsd);
          const avgPrice = microToUsd(pos.avgPriceUsd);
          const value = microToUsd(pos.valueUsd);
          const sellPrice = pos.sellPriceUsd != null ? microToUsd(pos.sellPriceUsd) : null;
          const pnl = microToUsd(pos.pnlUsdAfterFees);
          const payout = microToUsd(pos.payoutUsd);
          const marketStatus = pos.marketMetadata?.status || 'open';
          const marketResult = pos.marketMetadata?.result;
          
          const currentOdds = sellPrice ? sellPrice.toNumber() * 100 : 0;
          const entryOdds = avgPrice.toNumber() * 100;
          
          let status = 'OPEN';
          if (marketStatus === 'closed') {
            if (marketResult) {
              const won = (marketResult === 'yes' && pos.isYes) || (marketResult === 'no' && !pos.isYes);
              status = won ? 'WON' : 'LOST';
            } else {
              status = 'PENDING';
            }
          }
          if (pos.claimable) status = 'CLAIM';
          
          const pnlStr = `${pnl.gte(0) ? '+' : ''}$${pnl.toFixed(2)}`;
          const oddsStr = currentOdds > 0 ? `${currentOdds.toFixed(0)}%` : '-';
          
          console.log(`${title.padEnd(25)} ${status.padEnd(7)} ${oddsStr.padStart(4)}/${entryOdds.toFixed(0)}% ${pnlStr.padStart(8)} payout:$${payout.toFixed(2)}`);
          
          totalValue = totalValue.plus(value);
          totalPnl = totalPnl.plus(pnl);
          totalCost = totalCost.plus(cost);
        }
        
        console.log(`\nTotal: PnL ${totalPnl.gte(0) ? '+' : ''}$${totalPnl.toFixed(2)} | Cost $${totalCost.toFixed(2)} | Value $${totalValue.toFixed(2)}`);
        
        const claimable = result.positions.filter((p: any) => p.claimable);
        if (claimable.length > 0) {
          console.log(`\n${claimable.length} position(s) ready to claim:`);
          for (const pos of claimable) {
            console.log(`  trader predict claim ${pos.pubkey}`);
          }
        }
      } catch (error: any) {
        console.error('Error:', error.message);
      }
    };
    
    await fetchAndDisplay();
    setInterval(fetchAndDisplay, interval);
  });
