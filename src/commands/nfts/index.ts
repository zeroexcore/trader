import { Command } from 'commander';
import { floorCommand } from './floor.js';
import { listingsCommand } from './listings.js';
import { popularCommand } from './popular.js';
import { searchCommand } from './search.js';
import { positionsCommand } from './positions.js';

export const nftsCommand = new Command('nfts')
  .description('NFT market data and holdings');

nftsCommand.addCommand(floorCommand);
nftsCommand.addCommand(listingsCommand);
nftsCommand.addCommand(popularCommand);
nftsCommand.addCommand(searchCommand);
nftsCommand.addCommand(positionsCommand);
