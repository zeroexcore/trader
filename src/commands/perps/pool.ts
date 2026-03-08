import { Command } from 'commander';
import {
  getPoolInfo,
  assetToMint,
  PERPS_ASSETS,
  type PerpsAsset,
} from '../../utils/perps-api.js';
import { output, action } from '../shared.js';

export const poolCommand = new Command('pool')
  .description('View JLP pool stats and liquidity')
  .action(action(async () => {
    const results = await Promise.all(
      PERPS_ASSETS.map(async (asset: PerpsAsset) => {
        const pool = await getPoolInfo(assetToMint(asset));
        return { asset, pool };
      }),
    );

    const poolData = results.map(({ asset, pool }) => ({
      market: asset,
      longAvailableLiquidity: pool.longAvailableLiquidity,
      longBorrowRatePercent: pool.longBorrowRatePercent,
      longUtilizationPercent: pool.longUtilizationPercent,
      shortAvailableLiquidity: pool.shortAvailableLiquidity,
      shortBorrowRatePercent: pool.shortBorrowRatePercent,
      shortUtilizationPercent: pool.shortUtilizationPercent,
      openFeePercent: pool.openFeePercent,
    }));

    output({ pool: poolData }, () => {
      const lines = [
        'Jupiter Perpetuals Pool',
        '',
        'Market  Long Liq           Borrow   Util    Short Liq          Borrow   Util    Open Fee',
        '------- ------------------ -------- ------- ------------------ -------- ------- --------',
      ];
      for (const { asset, pool } of results) {
        lines.push(
          `${asset.padEnd(7)} ` +
          `${pool.longAvailableLiquidity.padEnd(18)} ` +
          `${(pool.longBorrowRatePercent + '%').padEnd(8)} ` +
          `${(pool.longUtilizationPercent + '%').padEnd(7)} ` +
          `${pool.shortAvailableLiquidity.padEnd(18)} ` +
          `${(pool.shortBorrowRatePercent + '%').padEnd(8)} ` +
          `${(pool.shortUtilizationPercent + '%').padEnd(7)} ` +
          `${pool.openFeePercent}%`
        );
      }
      return lines.join('\n');
    });
  }));
