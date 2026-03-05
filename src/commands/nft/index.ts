import { Command } from 'commander';
import { floorCommand } from './floor.js';
import { listingsCommand } from './listings.js';
import { popularCommand } from './popular.js';
import { searchCommand } from './search.js';
import { portfolioCommand } from './portfolio.js';

export const nftCommand = new Command('nft')
  .description('NFT trading via Magic Eden');

nftCommand.addCommand(floorCommand);
nftCommand.addCommand(listingsCommand);
nftCommand.addCommand(popularCommand);
nftCommand.addCommand(searchCommand);
nftCommand.addCommand(portfolioCommand);
