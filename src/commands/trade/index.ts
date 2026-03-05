import { Command } from 'commander';
import { quoteCommand } from './quote.js';
import { swapCommand } from './swap.js';

export const tradeCommand = new Command('trade')
  .description('Execute trades via Jupiter');

tradeCommand.addCommand(quoteCommand);
tradeCommand.addCommand(swapCommand);
