import { Command } from 'commander';
import { getWalletNFTs } from '../../utils/nft.js';
import { output, error, requirePassword } from '../shared.js';
import { getWalletAddress } from '../../utils/wallet.js';

export const portfolioCommand = new Command('portfolio')
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
