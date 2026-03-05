import { Command } from 'commander';
import { listCommand } from './list.js';
import { openCommand } from './open.js';
import { closeCommand } from './close.js';
import { noteCommand } from './note.js';
import { tagCommand } from './tag.js';
import { showCommand } from './show.js';
import { filterCommand } from './filter.js';
import { statsCommand } from './stats.js';
import { updateCommand } from './update.js';

export const positionsCommand = new Command('positions')
  .description('Track trading positions');

positionsCommand.addCommand(listCommand);
positionsCommand.addCommand(openCommand);
positionsCommand.addCommand(closeCommand);
positionsCommand.addCommand(noteCommand);
positionsCommand.addCommand(tagCommand);
positionsCommand.addCommand(showCommand);
positionsCommand.addCommand(filterCommand);
positionsCommand.addCommand(statsCommand);
positionsCommand.addCommand(updateCommand);
