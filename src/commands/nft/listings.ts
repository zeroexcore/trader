import { Command } from 'commander';
import { getListings, solToUsd, formatSol } from '../../utils/nft.js';
import { output, error } from '../shared.js';

export const listingsCommand = new Command('listings')
  .argument('<collection>', 'Collection symbol')
  .description('Browse listings for a collection')
  .option('-l, --limit <number>', 'Number of listings', '10')
  .action(async (collection, options) => {
    try {
      const listings = await getListings(collection, parseInt(options.limit));

      if (listings.length === 0) {
        output({ collection, listings: [] }, () => 'No listings found');
        return;
      }

      const listingsData = listings.map((l) => ({
        mint: l.mint,
        name: l.name,
        price: l.price.toNumber(),
        priceUsd: solToUsd(l.price).toNumber(),
        seller: l.seller,
      }));

      output(
        { collection, count: listings.length, listings: listingsData },
        () => {
          let md = `# ${collection} Listings\n\n`;
          for (const l of listings) {
            const usd = solToUsd(l.price);
            md += `**${l.name.slice(0, 50)}**\n`;
            md += `  ${formatSol(l.price)} (~$${usd.toFixed(0)}) | ${l.mint.slice(0, 8)}...\n\n`;
          }
          md += `Showing ${listings.length} listings`;
          return md;
        }
      );
    } catch (e: any) {
      error(e.message);
    }
  });
