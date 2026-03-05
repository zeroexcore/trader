import { Command } from 'commander';
import { searchToken } from '../../utils/jupiter.js';
import { output, action } from '../shared.js';

export const searchCommand = new Command('search')
  .argument('<query>', 'Token name or symbol')
  .description('Search tokens by name or symbol')
  .action(action(async (query) => {
    const tokens = await searchToken(query);

    output(
      { query, results: tokens.map(t => ({ symbol: t.symbol, name: t.name, mint: t.id || t.address, verified: !!t.isVerified })) },
      () => {
        if (tokens.length === 0) return `No tokens found for "${query}"`;
        const lines = tokens.map(t => {
          const badge = t.isVerified ? ' [verified]' : '';
          return `  ${(t.symbol || '').padEnd(10)} ${(t.name || '').slice(0, 28).padEnd(30)} ${t.id || t.address}${badge}`;
        });
        return `Search: "${query}"\n\n${lines.join('\n')}`;
      }
    );
  }));
