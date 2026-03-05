import { Connection } from '@solana/web3.js';
import { Command } from 'commander';
import { getAllCustodyInfo } from '../../utils/perps/index.js';
import { output, action } from '../shared.js';
import { getRpcUrl } from '../../config.js';

export const showCommand = new Command('show')
  .argument('[market]', 'Market symbol (SOL, ETH, BTC) — omit for all')
  .description('View market info, prices, and fees')
  .action(action(async (market) => {
    const connection = new Connection(getRpcUrl());
    const custodies = await getAllCustodyInfo(connection);

    const filtered = market
      ? custodies.filter(c => c.name.toUpperCase().startsWith(market.toUpperCase()))
      : custodies;

    if (filtered.length === 0) throw new Error(`Market "${market}" not found. Available: SOL, ETH, BTC`);

    const marketsData = filtered.map(c => ({
      market: c.name,
      maxLeverage: `${c.maxLeverage}x`,
      openFeePct: (c.openFeeBps / 100).toFixed(2),
      closeFeePct: (c.closeFeeBps / 100).toFixed(2),
    }));

    output({ markets: marketsData, tradeUrl: 'https://jup.ag/perps' }, () => {
      const lines = [
        'Jupiter Perpetuals',
        '',
        'Market      Max Lev   Open Fee   Close Fee',
        '----------- -------- ---------- ----------',
      ];
      for (const c of filtered) {
        lines.push(
          `${c.name.padEnd(11)} ${(c.maxLeverage + 'x').padEnd(8)} ${((c.openFeeBps / 100).toFixed(2) + '%').padEnd(10)} ${(c.closeFeeBps / 100).toFixed(2)}%`
        );
      }
      lines.push('', 'Trade at: https://jup.ag/perps');
      return lines.join('\n');
    });
  }));
