import { Command } from 'commander';
import { searchToken } from '../../utils/jupiter.js';
import { output, error } from '../shared.js';

export const searchCommand = new Command('search')
  .argument('<query>', 'Token name or symbol')
  .description('Search for token by name or symbol')
  .action(async (query) => {
    try {
      const tokens = await searchToken(query);

      output(
        { query, results: tokens.map((t) => ({ symbol: t.symbol, name: t.name, address: t.address })) },
        () => {
          const lines = ['🔍 Search Results:', ''];
          for (const t of tokens) {
            lines.push(`  ${t.symbol.padEnd(10)} ${t.name.slice(0, 30).padEnd(32)} ${t.address}`);
          }
          return lines.join('\n');
        }
      );
    } catch (e: any) {
      error('Search failed', e.message);
    }
  });
