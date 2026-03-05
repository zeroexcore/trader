import { Command } from 'commander';
import { Connection, PublicKey } from '@solana/web3.js';
import fs from 'fs';
import { output } from './shared.js';
import { env, paths, apis, getRpcUrl } from '../config.js';
import { getWalletAddress } from '../utils/wallet.js';

type Status = 'ok' | 'warn' | 'fail';
interface Check { name: string; status: Status; message: string }

// Individual check helpers - each returns a Check

async function checkWalletPassword(): Promise<Check> {
  const password = env.walletPassword();
  return password
    ? { name: 'WALLET_PASSWORD', status: 'ok', message: 'Set' }
    : { name: 'WALLET_PASSWORD', status: 'fail', message: 'Not set - required for wallet operations' };
}

async function checkHeliusKey(): Promise<Check> {
  const key = env.heliusApiKey();
  return key
    ? { name: 'HELIUS_API_KEY', status: 'ok', message: 'Set' }
    : { name: 'HELIUS_API_KEY', status: 'fail', message: 'Not set - get free key at https://dev.helius.xyz' };
}

async function checkJupiterKey(): Promise<Check> {
  const key = env.jupiterApiKey();
  return key
    ? { name: 'JUPITER_API_KEY', status: 'ok', message: 'Set' }
    : { name: 'JUPITER_API_KEY', status: 'warn', message: 'Not set - needed for predictions' };
}

async function checkWalletFile(): Promise<Check> {
  const walletPath = paths.walletFile();
  return fs.existsSync(walletPath)
    ? { name: 'Wallet file', status: 'ok', message: walletPath }
    : { name: 'Wallet file', status: 'fail', message: 'Not found - run: trader wallet generate' };
}

async function checkWalletDecryption(): Promise<Check & { address?: string }> {
  const password = env.walletPassword();
  const walletPath = paths.walletFile();
  
  if (!password || !fs.existsSync(walletPath)) {
    return { name: 'Wallet decryption', status: 'warn', message: 'Skipped - missing password or wallet' };
  }
  
  try {
    const address = getWalletAddress(password);
    return { name: 'Wallet decryption', status: 'ok', message: address, address };
  } catch (e: any) {
    return { name: 'Wallet decryption', status: 'fail', message: e.message };
  }
}

async function checkRpcConnection(): Promise<Check> {
  if (!env.heliusApiKey()) {
    return { name: 'Helius RPC', status: 'warn', message: 'Skipped - no API key' };
  }
  
  try {
    const connection = new Connection(getRpcUrl());
    const blockHeight = await connection.getBlockHeight();
    return { name: 'Helius RPC', status: 'ok', message: `Connected (block ${blockHeight})` };
  } catch (e: any) {
    return { name: 'Helius RPC', status: 'fail', message: e.message };
  }
}

async function checkSolBalance(walletAddress?: string): Promise<Check> {
  if (!walletAddress || !env.heliusApiKey()) {
    return { name: 'SOL balance', status: 'warn', message: 'Skipped - missing wallet or API key' };
  }
  
  try {
    const connection = new Connection(getRpcUrl());
    const balance = await connection.getBalance(new PublicKey(walletAddress));
    const sol = balance / 1e9;
    
    if (sol >= 0.01) return { name: 'SOL balance', status: 'ok', message: `${sol.toFixed(4)} SOL` };
    if (sol > 0) return { name: 'SOL balance', status: 'warn', message: `${sol.toFixed(4)} SOL - low` };
    return { name: 'SOL balance', status: 'fail', message: '0 SOL - fund wallet' };
  } catch (e: any) {
    return { name: 'SOL balance', status: 'fail', message: e.message };
  }
}

async function checkJupiterApi(): Promise<Check> {
  const key = env.jupiterApiKey();
  if (!key) {
    return { name: 'Jupiter API', status: 'warn', message: 'Skipped - no API key' };
  }
  
  try {
    const res = await fetch(`${apis.jupiterPrediction}/events?limit=1`, {
      headers: { 'x-api-key': key }
    });
    
    if (res.ok) return { name: 'Jupiter API', status: 'ok', message: 'Connected' };
    if (res.status === 401) return { name: 'Jupiter API', status: 'fail', message: 'Invalid API key' };
    if (res.status === 403) return { name: 'Jupiter API', status: 'fail', message: 'Geo-blocked' };
    return { name: 'Jupiter API', status: 'warn', message: `HTTP ${res.status}` };
  } catch (e: any) {
    return { name: 'Jupiter API', status: 'fail', message: e.message };
  }
}

// Run all checks and aggregate results
async function runDiagnostics() {
  // Run independent checks in parallel
  // Run independent checks in parallel
  const [walletPassword, heliusKey, jupiterKey, walletFile] = await Promise.all([
    checkWalletPassword(),
    checkHeliusKey(),
    checkJupiterKey(),
    checkWalletFile(),
  ]);

  const heliusSender = { 
    name: 'Helius Sender', 
    status: env.useHeliusSender() ? 'ok' as Status : 'ok' as Status, 
    message: env.useHeliusSender() ? 'Enabled' : 'Disabled' 
  };
  
  // Sequential checks that depend on previous results
  const walletDecrypt = await checkWalletDecryption();
  const rpc = await checkRpcConnection();
  const solBalance = await checkSolBalance(walletDecrypt.address);
  const jupiterApi = await checkJupiterApi();
  
  const checks = [walletPassword, heliusKey, jupiterKey, walletFile, heliusSender, walletDecrypt, rpc, solBalance, jupiterApi];
  
  const failures = checks.filter(c => c.status === 'fail').length;
  const warnings = checks.filter(c => c.status === 'warn').length;
  
  return {
    checks,
    summary: { total: checks.length, ok: checks.length - failures - warnings, warnings, failures }
  };
}

export const diagnoseCommand = new Command('diagnose')
  .description('Check environment, connectivity, and wallet status')
  .action(async () => {
    const result = await runDiagnostics();
    
    output(result, () => {
      const lines = result.checks.map(c => {
        const tag = c.status === 'ok' ? '[OK]' : c.status === 'warn' ? '[WARN]' : '[FAIL]';
        return `${tag} ${c.name}: ${c.message}`;
      });
      
      lines.push('');
      if (result.summary.failures === 0 && result.summary.warnings === 0) {
        lines.push('All checks passed');
      } else if (result.summary.failures === 0) {
        lines.push(`${result.summary.warnings} warning(s)`);
      } else {
        lines.push(`${result.summary.failures} failure(s)`);
      }
      
      return lines.join('\n');
    });
  });
