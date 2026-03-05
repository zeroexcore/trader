import { Command } from 'commander';
import { listCommand } from './list.js';
import { addCommand } from './add.js';
import { removeCommand } from './remove.js';
import { browseCommand } from './browse.js';
import { searchCommand } from './search.js';
import { infoCommand } from './info.js';
import { quoteCommand } from './quote.js';
import { swapCommand } from './swap.js';
import { positionsCommand } from './positions.js';

export const tokensCommand = new Command('tokens')
  .description('Token registry, market data, and swaps');

tokensCommand.addCommand(listCommand);
tokensCommand.addCommand(addCommand);
tokensCommand.addCommand(removeCommand);
tokensCommand.addCommand(browseCommand);
tokensCommand.addCommand(searchCommand);
tokensCommand.addCommand(infoCommand);
tokensCommand.addCommand(quoteCommand);
tokensCommand.addCommand(swapCommand);
tokensCommand.addCommand(positionsCommand);
