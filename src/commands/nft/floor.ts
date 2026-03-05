import { Command } from 'commander';
import { getCollectionStats, formatSol, solToUsd } from '../../utils/nft.js';
import { output, error } from '../shared.js';

export const floorCommand = new Command('floor')
  .argument('<collection>', 'Collection symbol')
  .description('Get floor price for a collection')
  .action(async (collection) => {
    try {
      const stats = await getCollectionStats(collection);
      const usd = solToUsd(stats.floorPrice);

      output(
        {
          collection: stats.symbol,
          name: stats.name,
          floorPrice: stats.floorPrice.toNumber(),
          floorPriceUsd: usd.toNumber(),
          listedCount: stats.listedCount,
          volumeAll: stats.volumeAll.toNumber(),
        },
        () => {
          let md = `# ${stats.name}\n\n`;
          md += `**Floor:** ${formatSol(stats.floorPrice)} (~$${usd.toFixed(0)})\n`;
          md += `**Listed:** ${stats.listedCount}\n`;
          md += `**Volume:** ${formatSol(stats.volumeAll)}\n`;
          return md;
        }
      );
    } catch (e: any) {
      error(e.message);
    }
  });
