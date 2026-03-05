import { Command } from 'commander';
import {
  getCollectionStats,
  getListings,
  getPopularCollections,
  searchCollections,
  getWalletNFTs,
  formatSol,
  solToUsd,
} from '../utils/nft.js';
import { output, error, requirePassword } from './shared.js';
import { getWalletAddress } from '../utils/wallet.js';

export function registerNftCommands(program: Command): void {
  const nft = program.command('nft').description('NFT trading via Magic Eden');

  nft
    .command('floor <collection>')
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

  nft
    .command('listings <collection>')
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

  nft
    .command('popular')
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

  nft
    .command('search <query>')
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

  nft
    .command('portfolio')
    .description('View your NFT holdings')
    .action(async () => {
      const password = requirePassword();
      try {
        const address = getWalletAddress(password);
        const nfts = await getWalletNFTs(address);

        if (nfts.length === 0) {
          output({ address, nfts: [] }, () => 'No NFTs found');
          return;
        }

        const nftsData = nfts.map((n) => ({
          mint: n.mintAddress,
          name: n.name || 'Unknown',
          collection: n.collection || 'Unknown',
          listStatus: n.listStatus,
          price: n.price || null,
        }));

        output(
          { address, count: nfts.length, nfts: nftsData },
          () => {
            let md = `# NFT Portfolio\n\nAddress: ${address}\n\n`;
            for (const n of nfts) {
              const listed = n.listStatus === 'listed' ? ' [LISTED]' : '';
              md += `**${n.name || 'Unknown'}**${listed}\n`;
              md += `  Collection: ${n.collection || 'Unknown'}\n`;
              md += `  Mint: ${n.mintAddress}\n`;
              if (n.price) {
                md += `  Price: ${n.price} SOL\n`;
              }
              md += '\n';
            }
            md += `Total: ${nfts.length} NFTs`;
            return md;
          }
        );
      } catch (e: any) {
        error(e.message);
      }
    });
}
