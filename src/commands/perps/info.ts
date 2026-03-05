import { Command } from 'commander';
import { output } from '../shared.js';

export const infoCommand = new Command('info')
  .description('How Jupiter Perps works')
  .action(() => {
    const infoData = {
      markets: ['SOL-PERP', 'ETH-PERP', 'BTC-PERP'],
      maxLeverage: '100x',
      collateral: ['SOL', 'USDC', 'USDT'],
      fees: {
        openClose: '0.06% of position size',
        borrow: 'Hourly rate based on utilization',
      },
      positions: {
        long: 'Profit when price goes UP',
        short: 'Profit when price goes DOWN',
      },
      liquidation: {
        trigger: 'Losses exceed collateral margin',
        note: 'Higher leverage = closer liquidation price',
        advice: 'Set stop-losses to protect capital',
      },
      warning: 'Leverage amplifies both gains AND losses. Start small (2-5x) until you understand the mechanics.',
      tradeUrl: 'https://jup.ag/perps',
    };

    output(infoData, () =>
      [
        'JUPITER PERPETUALS - QUICK GUIDE',
        '',
        'MARKETS: SOL-PERP, ETH-PERP, BTC-PERP',
        'LEVERAGE: Up to 100x',
        'COLLATERAL: SOL, USDC, or USDT',
        '',
        'FEES:',
        '  Open/Close: 0.06% of position size',
        '  Borrow: Hourly rate based on utilization',
        '',
        'LONG = Profit when price goes UP',
        'SHORT = Profit when price goes DOWN',
        '',
        'LIQUIDATION:',
        '  Happens when losses exceed collateral margin',
        '  Higher leverage = closer liquidation price',
        '  Set stop-losses to protect capital',
        '',
        'WARNING: Leverage amplifies both gains AND losses',
        'Start small (2-5x) until you understand the mechanics',
        '',
        'Trade at: https://jup.ag/perps',
      ].join('\n')
    );
  });
