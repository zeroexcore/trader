import { Command } from 'commander';
import { createCommand } from './create.js';
import { cancelCommand } from './cancel.js';
import { listCommand } from './list.js';

export const dcaCommand = new Command('dca')
  .description('Dollar-cost averaging (DCA) orders');

dcaCommand.addCommand(createCommand);
dcaCommand.addCommand(cancelCommand);
dcaCommand.addCommand(listCommand);
