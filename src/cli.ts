#!/usr/bin/env node
import { Command } from 'commander';
import dotenv from 'dotenv';
import { setRootProgram } from './commands/shared.js';
import { walletCommand } from './commands/wallet.js';
import { portfolioCommand } from './commands/portfolio.js';
import { tradeCommand } from './commands/trade/index.js';
import { searchCommand } from './commands/trade/search.js';
import { infoCommand } from './commands/trade/info.js';
import { bookCommand } from './commands/book.js';
import { positionsCommand } from './commands/positions/index.js';
import { predictCommand } from './commands/predict/index.js';
import { perpsCommand } from './commands/perps/index.js';
import { nftCommand } from './commands/nft/index.js';
import { diagnoseCommand } from './commands/diagnose.js';

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
program.addCommand(walletCommand);
program.addCommand(portfolioCommand);
program.addCommand(tradeCommand);
program.addCommand(searchCommand);
program.addCommand(infoCommand);
program.addCommand(bookCommand);
program.addCommand(positionsCommand);
program.addCommand(predictCommand);
program.addCommand(perpsCommand);
program.addCommand(nftCommand);
program.addCommand(diagnoseCommand);

program.parse(process.argv);
