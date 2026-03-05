import { Connection } from '@solana/web3.js';
import { Command } from 'commander';
import { getAllCustodyInfo } from '../../utils/perps/index.js';
import { output, error } from '../shared.js';
import { getRpcUrl } from '../../config.js';

export const marketsCommand = new Command('markets')
  .description('View available perps markets and fees')
  .action(async () => {
    try {
      const rpcUrl = getRpcUrl();
      const connection = new Connection(rpcUrl);

      const custodies = await getAllCustodyInfo(connection);

      const marketsData = custodies.map((c) => ({
        market: c.name,
        maxLeverage: `${c.maxLeverage}x`,
        openFeePct: (c.openFeeBps / 100).toFixed(2),
        closeFeePct: (c.closeFeeBps / 100).toFixed(2),
      }));

      output(
        {
          markets: marketsData,
          tradeUrl: 'https://jup.ag/perps',
        },
        () => {
          const lines = [
            'Jupiter Perpetuals Markets',
            '',
            'Market      Max Lev   Open Fee   Close Fee',
            '----------- -------- ---------- ----------',
          ];
          for (const c of custodies) {
            const maxLev = `${c.maxLeverage}x`.padEnd(8);
            const openFee = `${(c.openFeeBps / 100).toFixed(2)}%`.padEnd(10);
            const closeFee = `${(c.closeFeeBps / 100).toFixed(2)}%`;
            lines.push(`${c.name.padEnd(11)} ${maxLev} ${openFee} ${closeFee}`);
          }
          lines.push('', 'Trade at: https://jup.ag/perps');
          return lines.join('\n');
        }
      );
    } catch (e: any) {
      error('Failed to fetch markets', e.message);
    }
  });
