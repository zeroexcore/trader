import { Command } from 'commander';
import { showCommand } from './show.js';
import { positionsCommand } from './positions.js';
import { poolCommand } from './pool.js';
import { openCommand } from './open.js';
import { closeCommand } from './close.js';
import { increaseCommand } from './increase.js';
import { decreaseCommand } from './decrease.js';
import { tpslCommand } from './tpsl.js';

export const perpsCommand = new Command('perps')
  .description('Perpetual futures on SOL/ETH/BTC');

perpsCommand.addCommand(showCommand);
perpsCommand.addCommand(positionsCommand);
perpsCommand.addCommand(poolCommand);
perpsCommand.addCommand(openCommand);
perpsCommand.addCommand(closeCommand);
perpsCommand.addCommand(increaseCommand);
perpsCommand.addCommand(decreaseCommand);
perpsCommand.addCommand(tpslCommand);
