import { Command } from 'commander';
import { loadTokenBook, saveTokenBook } from '../../utils/token-book.js';
import { output, error } from '../shared.js';

export const addCommand = new Command('add')
  .argument('<ticker>', 'Token ticker symbol')
  .argument('<address>', 'Token mint address')
  .description('Save a token to registry')
  .action((ticker: string, address: string) => {
    if (address.length < 32) error('Invalid address', { address });

    const tokens = loadTokenBook();
    const upperTicker = ticker.toUpperCase();
    tokens[upperTicker] = address;
    saveTokenBook(tokens);

    output(
      { success: true, ticker: upperTicker, address },
      () => `Added ${upperTicker} → ${address}`
    );
  });
