import { Command } from 'commander';
import { listCommand } from './list.js';
import { searchCommand } from './search.js';
import { marketCommand } from './market.js';
import { buyCommand } from './buy.js';
import { positionsCommand } from './positions.js';
import { watchCommand } from './watch.js';
import { sellCommand } from './sell.js';
import { closeCommand } from './close.js';
import { claimCommand } from './claim.js';

export const predictCommand = new Command('predict')
  .description('Jupiter Prediction Markets (Beta)');

predictCommand.addCommand(listCommand);
predictCommand.addCommand(searchCommand);
predictCommand.addCommand(marketCommand);
predictCommand.addCommand(buyCommand);
predictCommand.addCommand(positionsCommand);
predictCommand.addCommand(watchCommand);
predictCommand.addCommand(sellCommand);
predictCommand.addCommand(closeCommand);
predictCommand.addCommand(claimCommand);
