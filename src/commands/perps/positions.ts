import { Connection } from '@solana/web3.js';
import { Command } from 'commander';
import {
  getPerpsPositions,
  rawToUsd,
  formatUsd,
} from '../../utils/perps-api.js';
import { getWalletAddress } from '../../utils/wallet.js';
import { output, action, requirePassword, getRpcUrl } from '../shared.js';

export const positionsCommand = new Command('positions')
  .description('View your open perps positions with PnL')
  .option('-w, --wallet <address>', 'Wallet address (defaults to configured wallet)')
  .action(action(async (options) => {
    let walletAddress = options.wallet;
    if (!walletAddress) {
      const password = requirePassword();
      walletAddress = getWalletAddress(password);
    }

    const rpcUrl = getRpcUrl();
    const connection = new Connection(rpcUrl, 'confirmed');

    const { dataList: positions, count } = await getPerpsPositions(walletAddress, connection);

    if (positions.length === 0) {
      output(
        { wallet: walletAddress, positions: [], message: 'No open perps positions found' },
        () => [
          `Perps Positions for ${walletAddress.slice(0, 8)}...`,
          '',
          'No open perps positions found',
          '',
          'Open a position: trader perps open SOL long 100 --leverage 5',
        ].join('\n'),
      );
      return;
    }

    const positionsData = positions.map(p => ({
      asset: p.asset,
      side: p.side,
      sizeUsd: rawToUsd(p.sizeUsd),
      collateralUsd: rawToUsd(p.collateralUsd),
      leverage: p.leverage,
      entryPriceUsd: rawToUsd(p.entryPriceUsd),
      markPriceUsd: rawToUsd(p.markPriceUsd),
      liquidationPriceUsd: rawToUsd(p.liquidationPriceUsd),
      pnlAfterFeesUsd: rawToUsd(p.pnlAfterFeesUsd),
      pnlAfterFeesPct: p.pnlAfterFeesPct,
      positionPubkey: p.positionPubkey,
    }));

    output({ wallet: walletAddress, positions: positionsData, count }, () => {
      const lines = [
        `Perps Positions for ${walletAddress.slice(0, 8)}...`,
        '',
        'Market  Side   Size         Entry        Mark         Liq          PnL              Lev',
        '------- ------ ------------ ------------ ------------ ------------ ---------------- ------',
      ];
      for (const p of positions) {
        const pnl = rawToUsd(p.pnlAfterFeesUsd);
        const pnlStr = `${pnl >= 0 ? '+' : ''}${formatUsd(p.pnlAfterFeesUsd)} (${p.pnlAfterFeesPct}%)`;
        lines.push(
          `${p.asset.padEnd(7)} ` +
          `${p.side.toUpperCase().padEnd(6)} ` +
          `${formatUsd(p.sizeUsd).padEnd(12)} ` +
          `${formatUsd(p.entryPriceUsd).padEnd(12)} ` +
          `${formatUsd(p.markPriceUsd).padEnd(12)} ` +
          `${formatUsd(p.liquidationPriceUsd).padEnd(12)} ` +
          `${pnlStr.padEnd(16)} ` +
          `${p.leverage}x`
        );
      }
      return lines.join('\n');
    });
  }));
