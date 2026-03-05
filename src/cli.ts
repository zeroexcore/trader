#!/usr/bin/env node
import { Command } from 'commander';
import dotenv from 'dotenv';
import { setRootProgram } from './commands/shared.js';
import { walletCommand } from './commands/wallet.js';
import { tokensCommand } from './commands/tokens/index.js';
import { portfolioCommand } from './commands/portfolio.js';
import { predictCommand } from './commands/predict/index.js';
import { perpsCommand } from './commands/perps/index.js';
import { nftsCommand } from './commands/nfts/index.js';
import { diagnoseCommand } from './commands/diagnose.js';

dotenv.config();

const program = new Command();

program
  .name('trader')
  .description('Solana trading CLI')
  .version('1.0.0')
  .option('--md', 'Output as markdown (default is JSON)');

setRootProgram(program);

program.addCommand(walletCommand);
program.addCommand(tokensCommand);
program.addCommand(portfolioCommand);
program.addCommand(predictCommand);
program.addCommand(perpsCommand);
program.addCommand(nftsCommand);
program.addCommand(diagnoseCommand);

program.parse(process.argv);
