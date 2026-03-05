import { Command } from 'commander';
import { getPopularCollections, solToUsd, formatSol } from '../../utils/nft.js';
import { output, error } from '../shared.js';

export const popularCommand = new Command('popular')
  .description('Show popular NFT collections')
  .option('-l, --limit <number>', 'Number of collections', '15')
  .action(async (options) => {
    try {
      const collections = await getPopularCollections(50);
      const limited = collections.slice(0, parseInt(options.limit));

      const collectionsData = limited.map((c) => ({
        symbol: c.symbol,
        name: c.name,
        floorPrice: c.floorPrice.toNumber(),
        floorPriceUsd: solToUsd(c.floorPrice).toNumber(),
        listedCount: c.listedCount,
      }));

      output(
        { count: limited.length, collections: collectionsData },
        () => {
          let md = `# Popular Collections (24h)\n\n`;
          for (const c of limited) {
            const usd = solToUsd(c.floorPrice);
            md += `**${c.name}**\n`;
            md += `  Floor: ${formatSol(c.floorPrice)} (~$${usd.toFixed(0)}) | Listed: ${c.listedCount}\n\n`;
          }
          return md;
        }
      );
    } catch (e: any) {
      error(e.message);
    }
  });
