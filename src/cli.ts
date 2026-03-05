#!/usr/bin/env node
import { Command } from 'commander';
import dotenv from 'dotenv';
import { setRootProgram } from './commands/shared.js';
import { registerWalletCommands } from './commands/wallet.js';
import { registerPortfolioCommands } from './commands/portfolio.js';
import { registerTradeCommands } from './commands/trade.js';
import { registerBookCommands } from './commands/book.js';
import { registerPositionsCommands } from './commands/positions.js';
import { registerPredictCommands } from './commands/predict.js';
import { registerPerpsCommands } from './commands/perps.js';
import { registerNftCommands } from './commands/nft.js';
import { registerDiagnoseCommand } from './commands/diagnose.js';

dotenv.config();

const program = new Command();

program
  .name('trader')
  .description('Solana trading CLI - Trade tokens, track portfolio, bet on prediction markets')
  .version('1.0.0')
  .option('--md', 'Output as markdown (default is JSON)');

// Initialize shared context
setRootProgram(program);

// Register commands
registerWalletCommands(program);
registerPortfolioCommands(program);
registerTradeCommands(program);
registerBookCommands(program);
registerPositionsCommands(program);
registerPredictCommands(program);
registerPerpsCommands(program);
registerNftCommands(program);
registerDiagnoseCommand(program);

program.parse(process.argv);
