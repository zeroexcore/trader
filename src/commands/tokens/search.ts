import { Command } from 'commander';
import { searchToken } from '../../utils/jupiter.js';
import { output, action } from '../shared.js';

export const searchCommand = new Command('search')
  .argument('<query>', 'Token name or symbol')
  .description('Search tokens by name or symbol')
  .action(action(async (query) => {
    const tokens = await searchToken(query);

    output(
      { query, results: tokens.map(t => ({ symbol: t.symbol, name: t.name, address: t.address })) },
      () => {
        if (tokens.length === 0) return `No tokens found for "${query}"`;
        const lines = tokens.map(t =>
          `  ${t.symbol.padEnd(10)} ${t.name.slice(0, 30).padEnd(32)} ${t.address}`
        );
        return `Search: "${query}"\n\n${lines.join('\n')}`;
      }
    );
  }));
