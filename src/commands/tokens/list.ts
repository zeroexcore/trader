import { Command } from 'commander';
import { loadTokenBook } from '../../utils/token-book.js';
import { output } from '../shared.js';

export const listCommand = new Command('list')
  .description('List saved token addresses')
  .action(() => {
    const tokens = loadTokenBook();
    const entries = Object.entries(tokens).map(([ticker, address]) => ({ ticker, address }));
    output({ tokens: entries }, () => {
      if (entries.length === 0) return 'No tokens saved. Add with: trader tokens add <TICKER> <address>';
      const rows = entries.map(e => `  ${e.ticker.padEnd(10)} ${e.address}`).join('\n');
      return `Token Registry\n\n${rows}`;
    });
  });
