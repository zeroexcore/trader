import { Connection, PublicKey } from '@solana/web3.js';
import { Command } from 'commander';
import {
  getPoolStats,
  getAllCustodyInfo,
  getOpenPositions,
  CUSTODY,
} from '../utils/perps/index.js';
import { output, error, requirePassword, getRpcUrl } from './shared.js';
import { getWalletAddress } from '../utils/wallet.js';

export function registerPerpsCommands(program: Command): void {
  const perps = program
    .command('perps')
    .description('Jupiter Perpetuals - leverage trading on SOL/ETH/BTC');

  perps
    .command('pool')
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

  perps
    .command('markets')
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

  perps
    .command('positions')
    .description('View your open perps positions')
    .option('-w, --wallet <address>', 'Wallet address (defaults to configured wallet)')
    .action(async (options) => {
      try {
        const rpcUrl = getRpcUrl();
        const connection = new Connection(rpcUrl);

        let walletAddress = options.wallet;
        if (!walletAddress) {
          const password = requirePassword();
          walletAddress = getWalletAddress(password);
        }

        const positions = await getOpenPositions(connection, new PublicKey(walletAddress));

        if (positions.length === 0) {
          output(
            {
              wallet: walletAddress,
              positions: [],
              message: 'No open perps positions found',
              tradeUrl: 'https://jup.ag/perps',
            },
            () =>
              [
                `Perps Positions for ${walletAddress.slice(0, 8)}...`,
                '',
                'No open perps positions found',
                '',
                'Open a position at: https://jup.ag/perps',
              ].join('\n')
          );
          return;
        }

        const positionsData = positions.map((pos) => ({
          market: pos.custody,
          side: pos.side,
          sizeUsd: pos.sizeUsd.toFixed(2),
          collateralUsd: pos.collateralUsd.toFixed(2),
          leverage: pos.leverage.toFixed(1),
          entryPrice: pos.entryPrice.toFixed(2),
          publicKey: pos.publicKey,
        }));

        output(
          {
            wallet: walletAddress,
            positions: positionsData,
          },
          () => {
            const lines = [
              `Perps Positions for ${walletAddress.slice(0, 8)}...`,
              '',
              'Market  Side   Size         Collateral   Leverage  Entry',
              '------- ------ ------------ ------------ --------- ----------',
            ];
            for (const pos of positions) {
              const side = pos.side.toUpperCase().padEnd(6);
              const size = `$${pos.sizeUsd.toFixed(2)}`.padEnd(12);
              const collateral = `$${pos.collateralUsd.toFixed(2)}`.padEnd(12);
              const leverage = `${pos.leverage.toFixed(1)}x`.padEnd(9);
              const entry = `$${pos.entryPrice.toFixed(2)}`;
              lines.push(`${pos.custody.padEnd(7)} ${side} ${size} ${collateral} ${leverage} ${entry}`);
            }
            return lines.join('\n');
          }
        );
      } catch (e: any) {
        error('Failed to fetch positions', e.message);
      }
    });

  perps
    .command('info')
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
}
