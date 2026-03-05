import { Command } from 'commander';
import { loadTokenBook, saveTokenBook } from '../../utils/token-book.js';
import { output, error } from '../shared.js';

export const removeCommand = new Command('remove')
  .argument('<ticker>', 'Token ticker symbol')
  .description('Remove a token from registry')
  .action((ticker: string) => {
    const tokens = loadTokenBook();
    const upperTicker = ticker.toUpperCase();

    if (!tokens[upperTicker]) error('Token not found', { ticker: upperTicker });

    const address = tokens[upperTicker];
    delete tokens[upperTicker];
    saveTokenBook(tokens);

    output(
      { success: true, ticker: upperTicker, removed: address },
      () => `Removed ${upperTicker} (${address})`
    );
  });
