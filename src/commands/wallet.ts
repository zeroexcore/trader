import { Command } from 'commander';
import {
  generateWallet,
  getWalletAddress,
  exportPrivateKey,
} from '../utils/wallet.js';
import { output, error, requirePassword } from './shared.js';

export function registerWalletCommands(program: Command): void {
  const wallet = program.command('wallet').description('Wallet management commands');

  wallet
    .command('generate')
    .description('Generate a new encrypted wallet (ONE TIME ONLY)')
    .action(async () => {
      const password = requirePassword();
      try {
        const publicKey = generateWallet(password);
        const address = publicKey.toBase58();
        output(
          { success: true, address, warning: 'Backup private key with: trader wallet export (run on server only)' },
          () => `Wallet generated: ${address}\n\nIMPORTANT: Run \`trader wallet export\` on server to backup private key.`
        );
      } catch (e: any) {
        error(e.message);
      }
    });

  wallet
    .command('address')
    .description('Get wallet address (safe to share)')
    .action(async () => {
      const password = requirePassword();
      try {
        const address = getWalletAddress(password);
        output({ address }, () => address);
      } catch (e: any) {
        error(e.message);
      }
    });

  wallet
    .command('export')
    .description('Export private key for backup (KEEP SECRET!)')
    .action(async () => {
      const password = requirePassword();
      try {
        const privateKey = await exportPrivateKey(password);
        output(
          { privateKey, warning: 'NEVER SHARE - import into Phantom/Solflare for recovery' },
          () => `Private Key (base58):\n${privateKey}\n\nImport into Phantom/Solflare for recovery.`
        );
      } catch (e: any) {
        error(e.message);
      }
    });
}
