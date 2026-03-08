import { Command } from 'commander';
import {
  getMarketStats,
  getPoolInfo,
  assetToMint,
  PERPS_ASSETS,
  type PerpsAsset,
} from '../../utils/perps-api.js';
import { output, action } from '../shared.js';

export const showCommand = new Command('show')
  .argument('[market]', 'Market symbol (SOL, ETH, BTC) — omit for all')
  .description('View market prices, stats, and pool info')
  .action(action(async (market) => {
    const assets: PerpsAsset[] = market
      ? [market.toUpperCase() as PerpsAsset]
      : [...PERPS_ASSETS];

    // Validate
    for (const a of assets) assetToMint(a);

    // Fetch market stats and pool info in parallel
    const results = await Promise.all(
      assets.map(async (asset) => {
        const mint = assetToMint(asset);
        const [stats, pool] = await Promise.all([
          getMarketStats(mint),
          getPoolInfo(mint),
        ]);
        return { asset, stats, pool };
      }),
    );

    const marketsData = results.map(({ asset, stats, pool }) => ({
      market: asset,
      price: stats.price,
      priceChange24H: stats.priceChange24H,
      priceHigh24H: stats.priceHigh24H,
      priceLow24H: stats.priceLow24H,
      volume: stats.volume,
      longLiquidity: pool.longAvailableLiquidity,
      longBorrowRate: pool.longBorrowRatePercent,
      longUtilization: pool.longUtilizationPercent,
      shortLiquidity: pool.shortAvailableLiquidity,
      shortBorrowRate: pool.shortBorrowRatePercent,
      shortUtilization: pool.shortUtilizationPercent,
      openFee: pool.openFeePercent,
    }));

    output({ markets: marketsData, tradeUrl: 'https://jup.ag/perps' }, () => {
      const lines = ['Jupiter Perpetuals', ''];
      for (const { asset, stats, pool } of results) {
        const price = parseFloat(String(stats.price));
        const change = parseFloat(String(stats.priceChange24H));
        const high = parseFloat(String(stats.priceHigh24H));
        const low = parseFloat(String(stats.priceLow24H));
        const chg = change >= 0 ? `+${change.toFixed(2)}%` : `${change.toFixed(2)}%`;
        lines.push(`${asset}-PERP`);
        lines.push(`  Price: $${price.toLocaleString()}  24h: ${chg}  H: $${high.toLocaleString()} L: $${low.toLocaleString()}`);
        lines.push(`  Long:  Liquidity ${pool.longAvailableLiquidity}  Borrow ${pool.longBorrowRatePercent}%  Util ${pool.longUtilizationPercent}%`);
        lines.push(`  Short: Liquidity ${pool.shortAvailableLiquidity}  Borrow ${pool.shortBorrowRatePercent}%  Util ${pool.shortUtilizationPercent}%`);
        lines.push(`  Open Fee: ${pool.openFeePercent}%`);
        lines.push('');
      }
      lines.push('Trade at: https://jup.ag/perps');
      return lines.join('\n');
    });
  }));
