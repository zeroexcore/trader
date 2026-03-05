import { Command } from 'commander';
import { getPortfolio } from '../../utils/helius.js';
import { getWalletAddress } from '../../utils/wallet.js';
import { output, action, requirePassword } from '../shared.js';

export const positionsCommand = new Command('positions')
  .description('View token holdings and unrealized PnL')
  .action(action(async () => {
    const password = requirePassword();
    const address = getWalletAddress(password);
    const data = await getPortfolio(address);
    const holdings = data.tokens.filter(t => t.valueUsd >= 0.01);

    output(
      { address, totalUsd: data.totalValueUsd, holdings },
      () => {
        if (holdings.length === 0) return `No token holdings for ${address}`;
        const lines = holdings.map(t =>
          `  ${t.symbol.padEnd(8)} ${t.balance.toFixed(4).padStart(14)} @ $${t.pricePerToken.toFixed(2).padStart(10)} = $${t.valueUsd.toFixed(2).padStart(10)}`
        );
        return [
          `Token Holdings`,
          `Address: ${address}`,
          `Total: $${data.totalValueUsd.toFixed(2)}`,
          '',
          ...lines,
        ].join('\n');
      }
    );
  }));
