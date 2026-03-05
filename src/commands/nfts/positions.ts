import { Command } from 'commander';
import { getWalletNFTs } from '../../utils/nft.js';
import { getWalletAddress } from '../../utils/wallet.js';
import { output, action, requirePassword } from '../shared.js';

export const positionsCommand = new Command('positions')
  .description('View your NFT holdings')
  .action(action(async () => {
    const password = requirePassword();
    const address = getWalletAddress(password);
    const nfts = await getWalletNFTs(address);

    output(
      { address, count: nfts.length, nfts: nfts.map(n => ({ mint: n.mintAddress, name: n.name || 'Unknown', collection: n.collection || 'Unknown' })) },
      () => {
        if (nfts.length === 0) return `No NFTs found for ${address}`;
        let md = `NFT Holdings (${nfts.length})\n\n`;
        for (const n of nfts) {
          const listed = n.listStatus === 'listed' ? ' [LISTED]' : '';
          md += `  ${(n.name || 'Unknown').slice(0, 40)}${listed}\n`;
          md += `    ${n.collection || 'Unknown'} | ${n.mintAddress}\n`;
        }
        return md;
      }
    );
  }));
