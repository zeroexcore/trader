import { Command } from 'commander';
import { browseCommand } from './browse.js';
import { searchCommand } from './search.js';
import { showCommand } from './show.js';
import { buyCommand } from './buy.js';
import { sellCommand } from './sell.js';
import { closeCommand } from './close.js';
import { claimCommand } from './claim.js';
import { positionsCommand } from './positions.js';

export const predictCommand = new Command('predict')
  .description('Prediction markets');

predictCommand.addCommand(browseCommand);
predictCommand.addCommand(searchCommand);
predictCommand.addCommand(showCommand);
predictCommand.addCommand(buyCommand);
predictCommand.addCommand(sellCommand);
predictCommand.addCommand(closeCommand);
predictCommand.addCommand(claimCommand);
predictCommand.addCommand(positionsCommand);
