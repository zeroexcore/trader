import { Command } from 'commander';
import { resolveToken } from '../../utils/token-book.js';
import { formatTokenInfo, getTokenInfo } from '../../utils/token-info.js';
import { output, action } from '../shared.js';

export const infoCommand = new Command('info')
  .argument('<token>', 'Token symbol or address')
  .description('Get detailed token market data')
  .action(action(async (tokenOrTicker) => {
    const address = resolveToken(tokenOrTicker);
    const info = await getTokenInfo(address);
    output(info, () => formatTokenInfo(info));
  }));
