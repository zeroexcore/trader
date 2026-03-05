import { Connection, PublicKey } from '@solana/web3.js';
import { Command } from 'commander';
import { getOpenPositions } from '../../utils/perps/index.js';
import { output, error, requirePassword, getRpcUrl } from '../shared.js';
import { getWalletAddress } from '../../utils/wallet.js';

export const positionsCommand = new Command('positions')
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
