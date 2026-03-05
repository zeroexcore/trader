import { Command } from 'commander';
import { browseTokens } from '../../utils/jupiter.js';
import { output, action } from '../shared.js';

export const browseCommand = new Command('browse')
  .description('Discover trending and popular tokens')
  .option('-l, --limit <number>', 'Number of results', '15')
  .action(action(async (options) => {
    const tokens = await browseTokens(parseInt(options.limit));

    output(
      { count: tokens.length, tokens: tokens.map(t => ({ symbol: t.symbol, name: t.name, mint: t.id, verified: !!t.isVerified, organicScore: t.organicScore })) },
      () => {
        if (tokens.length === 0) return 'No tokens found';
        const lines = tokens.map(t => {
          const badge = t.isVerified ? ' [verified]' : '';
          return `  ${(t.symbol || '').padEnd(10)} ${(t.name || '').slice(0, 28).padEnd(30)} ${t.id}${badge}`;
        });
        return `Top Tokens (by organic score, 24h)\n\n${lines.join('\n')}`;
      }
    );
  }));
