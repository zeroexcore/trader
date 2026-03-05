import { Command } from 'commander';
import { resolveToken } from '../../utils/token-book.js';
import { formatTokenInfo, getTokenInfo } from '../../utils/token-info.js';
import { output, error } from '../shared.js';

export const infoCommand = new Command('info')
  .argument('<token>', 'Token symbol or address')
  .description('Get detailed token information by symbol or address')
  .action(async (tokenOrTicker) => {
    try {
      const tokenAddress = resolveToken(tokenOrTicker);
      const info = await getTokenInfo(tokenAddress);

      output(
        {
          ...info,
          explorers: {
            solscan: `https://solscan.io/token/${info.address}`,
            solanaExplorer: `https://explorer.solana.com/address/${info.address}`,
            dexscreener: info.markets?.[0]?.pair ? `https://dexscreener.com/solana/${info.markets[0].pair}` : null,
          },
        },
        () => {
          const formatted = formatTokenInfo(info);
          const links = [
            '',
            '🔗 EXPLORERS',
            `   Solscan: https://solscan.io/token/${info.address}`,
            `   Solana Explorer: https://explorer.solana.com/address/${info.address}`,
          ];
          if (info.markets && info.markets.length > 0) {
            links.push(`   DexScreener: https://dexscreener.com/solana/${info.markets[0].pair}`);
          }
          return formatted + links.join('\n');
        }
      );
    } catch (e: any) {
      error('Failed to get token info', e.message);
    }
  });
