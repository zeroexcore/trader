import { Command } from 'commander';
import { loadTokenBook, saveTokenBook } from '../utils/token-book.js';
import { output, error } from './shared.js';

export const bookCommand = new Command('book').description('Manage token address book');

bookCommand
  .command('list')
  .description('List all tokens in address book')
  .action(() => {
    const tokens = loadTokenBook();
    const entries = Object.entries(tokens).map(([ticker, address]) => ({ ticker, address }));
    output({ tokens: entries }, () => {
      if (entries.length === 0) return 'Token address book is empty';
      const rows = entries.map((e) => `| ${e.ticker} | ${e.address} |`).join('\n');
      return `## Token Address Book\n\n| Ticker | Address |\n|--------|---------||\n${rows}`;
    });
  });

bookCommand
  .command('add <ticker> <address>')
  .description('Add token to address book')
  .action((ticker: string, address: string) => {
    const tokens = loadTokenBook();
    const upperTicker = ticker.toUpperCase();

    if (address.length < 32) error('Invalid address', { address });

    tokens[upperTicker] = address;
    saveTokenBook(tokens);

    output(
      { success: true, ticker: upperTicker, address },
      () => `Added **${upperTicker}** → \`${address}\``
    );
  });

bookCommand
  .command('remove <ticker>')
  .description('Remove token from address book')
  .action((ticker: string) => {
    const tokens = loadTokenBook();
    const upperTicker = ticker.toUpperCase();

    if (!tokens[upperTicker]) {
      error('Token not found', { ticker: upperTicker });
    }

    const address = tokens[upperTicker];
    delete tokens[upperTicker];
    saveTokenBook(tokens);

    output(
      { success: true, ticker: upperTicker, removed: address },
      () => `Removed **${upperTicker}** (\`${address}\`)`
    );
  });
