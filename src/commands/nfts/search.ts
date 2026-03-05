import { Command } from 'commander';
import { searchCollections, solToUsd, formatSol } from '../../utils/nft.js';
import { output, error } from '../shared.js';

export const searchCommand = new Command('search')
  .argument('<query>', 'Search query')
  .description('Search for NFT collections')
  .action(async (query) => {
    try {
      const collections = await searchCollections(query);
      const limited = collections.slice(0, 10);

      if (limited.length === 0) {
        output({ query, collections: [] }, () => 'No collections found');
        return;
      }

      const collectionsData = limited.map((c) => ({
        symbol: c.symbol,
        name: c.name,
        floorPrice: c.floorPrice.toNumber(),
        floorPriceUsd: solToUsd(c.floorPrice).toNumber(),
        listedCount: c.listedCount,
      }));

      output(
        { query, count: limited.length, collections: collectionsData },
        () => {
          let md = `# Search: "${query}"\n\n`;
          for (const c of limited) {
            const usd = solToUsd(c.floorPrice);
            md += `**${c.name}** (${c.symbol})\n`;
            md += `  Floor: ${formatSol(c.floorPrice)} (~$${usd.toFixed(0)})\n\n`;
          }
          return md;
        }
      );
    } catch (e: any) {
      error(e.message);
    }
  });
