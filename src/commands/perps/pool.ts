import { Connection } from '@solana/web3.js';
import { Command } from 'commander';
import { getPoolStats } from '../../utils/perps/index.js';
import { output, error } from '../shared.js';
import { getRpcUrl } from '../../config.js';

export const poolCommand = new Command('pool')
  .description('View JLP pool stats and AUM')
  .action(async () => {
    try {
      const rpcUrl = getRpcUrl();
      const connection = new Connection(rpcUrl);

      const stats = await getPoolStats(connection);

      output(
        {
          aumUsd: stats.aumUsd.toFixed(2),
          aumFormatted: `$${stats.aumUsd.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',')}`,
          markets: ['SOL-PERP', 'ETH-PERP', 'BTC-PERP'],
          maxLeverage: '100x',
          fees: '0.06%',
        },
        () =>
          [
            'Jupiter Perpetuals Pool Stats',
            '',
            `Pool AUM: $${stats.aumUsd.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',')}`,
            '',
            'Available Markets: SOL-PERP, ETH-PERP, BTC-PERP',
            'Max Leverage: Up to 100x',
            'Fees: 0.06% open/close',
          ].join('\n')
      );
    } catch (e: any) {
      error('Failed to fetch pool stats', e.message);
    }
  });
