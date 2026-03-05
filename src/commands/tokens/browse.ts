import { Command } from 'commander';
import { apis } from '../../config.js';
import { output, action } from '../shared.js';

export const browseCommand = new Command('browse')
  .description('Discover trending and popular tokens')
  .option('-l, --limit <number>', 'Number of results', '15')
  .action(action(async (options) => {
    const res = await fetch(apis.jupiterTokenList);
    if (!res.ok) throw new Error(`Failed to fetch token list: ${res.status}`);

    const tokens = (await res.json()) as any[];
    const top = tokens.slice(0, parseInt(options.limit));

    output(
      { count: top.length, tokens: top.map(t => ({ symbol: t.symbol, name: t.name, address: t.address })) },
      () => {
        const lines = top.map(t =>
          `  ${t.symbol.padEnd(10)} ${(t.name || '').slice(0, 30).padEnd(32)} ${t.address}`
        );
        return `Top Tokens (Jupiter Strict List)\n\n${lines.join('\n')}`;
      }
    );
  }));
