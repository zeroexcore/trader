import { Command } from 'commander';
import { createCommand } from './create.js';
import { cancelCommand } from './cancel.js';
import { listCommand } from './list.js';

export const limitCommand = new Command('limit')
  .description('Limit orders for spot trading');

limitCommand.addCommand(createCommand);
limitCommand.addCommand(cancelCommand);
limitCommand.addCommand(listCommand);
