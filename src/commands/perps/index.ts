import { Command } from 'commander';
import { poolCommand } from './pool.js';
import { marketsCommand } from './markets.js';
import { positionsCommand } from './positions.js';
import { infoCommand } from './info.js';

export const perpsCommand = new Command('perps')
  .description('Jupiter Perpetuals - leverage trading on SOL/ETH/BTC');

perpsCommand.addCommand(poolCommand);
perpsCommand.addCommand(marketsCommand);
perpsCommand.addCommand(positionsCommand);
perpsCommand.addCommand(infoCommand);
