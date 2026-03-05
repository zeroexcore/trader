import { Command } from 'commander';
import { showCommand } from './show.js';
import { positionsCommand } from './positions.js';
import { poolCommand } from './pool.js';

export const perpsCommand = new Command('perps')
  .description('Perpetual futures on SOL/ETH/BTC');

perpsCommand.addCommand(showCommand);
perpsCommand.addCommand(positionsCommand);
perpsCommand.addCommand(poolCommand);
