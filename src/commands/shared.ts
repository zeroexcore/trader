import { Command } from 'commander';

// Get the root program to access global options
let rootProgram: Command | null = null;

export function setRootProgram(program: Command): void {
  rootProgram = program;
}

function getOpts(): { md?: boolean } {
  return rootProgram?.opts() ?? {};
}

// Output helper - JSON by default, markdown with --md
export function output(data: any, mdFormatter?: () => string): void {
  const opts = getOpts();
  if (opts.md && mdFormatter) {
    console.log(mdFormatter());
  } else {
    console.log(JSON.stringify(data, null, 2));
  }
}

// Error output
export function error(message: string, details?: any): never {
  const opts = getOpts();
  if (opts.md) {
    console.error(`Error: ${message}`);
    if (details) console.error(details);
  } else {
    console.log(JSON.stringify({ error: message, details }, null, 2));
  }
  process.exit(1);
}

// Helper to get wallet password from environment
export function requirePassword(): string {
  const password = process.env.WALLET_PASSWORD;
  if (!password) {
    error('WALLET_PASSWORD environment variable required');
  }
  return password;
}

// Helper to get RPC URL (defaults to Helius if HELIUS_API_KEY is set)
export function getRpcUrl(): string {
  if (process.env.RPC_URL) return process.env.RPC_URL;
  if (process.env.HELIUS_API_KEY) {
    return `https://mainnet.helius-rpc.com/?api-key=${process.env.HELIUS_API_KEY}`;
  }
  throw new Error('RPC_URL or HELIUS_API_KEY must be set');
}
