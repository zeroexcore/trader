import { Keypair, PublicKey } from '@solana/web3.js';
import fs from 'fs';
import crypto from 'crypto';
import { paths } from '../config.js';

const ALGORITHM = 'aes-256-gcm';

/**
 * Generate a new Solana keypair and securely store it
 * SECURITY: Wallet is encrypted at rest. Agent should NEVER disclose the private key.
 * NOTE: This can be run by agent (one-time operation). Export requires manual confirmation.
 */
export function generateWallet(password: string): PublicKey {
  const walletDir = paths.openclawDir();
  const walletPath = paths.walletFile();
  
  // Create .openclaw directory if it doesn't exist
  if (!fs.existsSync(walletDir)) {
    fs.mkdirSync(walletDir, { mode: 0o700, recursive: true });
  }

  // Check if wallet already exists
  if (fs.existsSync(walletPath)) {
    throw new Error('Wallet already exists. Use load-wallet to retrieve address.');
  }

  // Generate new keypair
  const keypair = Keypair.generate();
  
  // Encrypt and save
  const encrypted = encryptKeypair(keypair, password);
  fs.writeFileSync(walletPath, JSON.stringify(encrypted), { mode: 0o600 });
  
  console.log('⚠️  SECURITY NOTICE: Wallet generated and encrypted at:', walletPath);
  console.log('⚠️  DO NOT share private key or password with anyone');
  
  return keypair.publicKey;
}

/**
 * Load existing wallet and return public key only
 */
function loadWallet(password: string): PublicKey {
  const walletPath = paths.walletFile();
  if (!fs.existsSync(walletPath)) {
    throw new Error('No wallet found. Use generate-wallet first.');
  }

  const encrypted = JSON.parse(fs.readFileSync(walletPath, 'utf-8'));
  const keypair = decryptKeypair(encrypted, password);
  
  return keypair.publicKey;
}

/**
 * Load keypair for signing transactions (internal use only)
 */
export function loadKeypairForSigning(password: string): Keypair {
  const walletPath = paths.walletFile();
  if (!fs.existsSync(walletPath)) {
    throw new Error('No wallet found. Use generate-wallet first.');
  }

  const encrypted = JSON.parse(fs.readFileSync(walletPath, 'utf-8'));
  return decryptKeypair(encrypted, password);
}

const SCRYPT_OPTS = { N: 16384, r: 8, p: 1 };

function encryptKeypair(keypair: Keypair, password: string) {
  const salt = crypto.randomBytes(32);
  const key = crypto.scryptSync(password, salt, 32, SCRYPT_OPTS);
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  
  const secretKey = Buffer.from(keypair.secretKey);
  let encrypted = cipher.update(secretKey);
  encrypted = Buffer.concat([encrypted, cipher.final()]);
  
  const authTag = cipher.getAuthTag();
  
  return {
    salt: salt.toString('hex'),
    iv: iv.toString('hex'),
    authTag: authTag.toString('hex'),
    encrypted: encrypted.toString('hex')
  };
}

function decryptKeypair(encrypted: any, password: string): Keypair {
  // Backward compat: legacy wallets used static 'salt', new wallets store random salt
  const salt = encrypted.salt ? Buffer.from(encrypted.salt, 'hex') : 'salt';
  const key = crypto.scryptSync(password, salt, 32, SCRYPT_OPTS);
  const decipher = crypto.createDecipheriv(
    ALGORITHM,
    key,
    Buffer.from(encrypted.iv, 'hex')
  );
  
  decipher.setAuthTag(Buffer.from(encrypted.authTag, 'hex'));
  
  let decrypted = decipher.update(Buffer.from(encrypted.encrypted, 'hex'));
  decrypted = Buffer.concat([decrypted, decipher.final()]);
  
  return Keypair.fromSecretKey(decrypted);
}

/**
 * Get wallet address without exposing private key
 */
export function getWalletAddress(password: string): string {
  const publicKey = loadWallet(password);
  return publicKey.toBase58();
}

import * as readline from 'readline';

// Word list for generating confirmation phrases
const CONFIRM_WORDS = [
  'alpha', 'bravo', 'charlie', 'delta', 'echo', 'foxtrot', 'golf', 'hotel',
  'india', 'juliet', 'kilo', 'lima', 'mike', 'november', 'oscar', 'papa',
  'quebec', 'romeo', 'sierra', 'tango', 'uniform', 'victor', 'whiskey', 'xray',
  'yankee', 'zulu', 'red', 'blue', 'green', 'orange', 'purple', 'yellow'
];

/**
 * Generate a random confirmation phrase
 */
function generateConfirmPhrase(): string {
  const words: string[] = [];
  for (let i = 0; i < 3; i++) {
    const idx = Math.floor(Math.random() * CONFIRM_WORDS.length);
    words.push(CONFIRM_WORDS[idx]);
  }
  return words.join('-');
}

/**
 * Require user to type a confirmation phrase
 * This prevents automated extraction via agents/bots
 */
async function requireManualConfirmation(action: string): Promise<void> {
  // Check for agent environment - hard block
  const agentIndicators = [
    'OPENCLAW_SESSION',
    'OPENCLAW_AGENT',
    'OPENCLAW_CHANNEL',
    'TELEGRAM_BOT_TOKEN',
    'DISCORD_TOKEN', 
    'SLACK_BOT_TOKEN',
  ];
  
  if (agentIndicators.some(env => process.env[env])) {
    throw new Error(
      '🔒 SECURITY: This command cannot be run via agent/bot.\n' +
      'SSH into your server and run directly: trader wallet export'
    );
  }

  // Require an interactive terminal — blocks piped/redirected/automated invocations
  if (!process.stdin.isTTY) {
    throw new Error(
      '🔒 SECURITY: This command requires an interactive terminal (TTY).\n' +
      'SSH into your server and run directly: trader wallet export'
    );
  }

  const phrase = generateConfirmPhrase();
  
  console.log('\n🔒 SECURITY CONFIRMATION REQUIRED');
  console.log(`   Action: ${action}`);
  console.log(`\n   To confirm, type this phrase exactly: ${phrase}\n`);

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve, reject) => {
    // Timeout after 30 seconds
    const timeout = setTimeout(() => {
      rl.close();
      reject(new Error('Confirmation timed out. Please try again.'));
    }, 30000);

    rl.question('   Confirm: ', (answer) => {
      clearTimeout(timeout);
      rl.close();
      
      if (answer.trim().toLowerCase() === phrase.toLowerCase()) {
        resolve();
      } else {
        reject(new Error('Confirmation phrase did not match. Aborting for security.'));
      }
    });
  });
}

/**
 * Export private key as base58 string for backup
 * WARNING: Only use this for secure backup. Never share.
 * SECURITY: Requires manual confirmation - cannot be automated via agent/remote.
 */
export async function exportPrivateKey(password: string): Promise<string> {
  // Security check: require manual confirmation
  await requireManualConfirmation('Export wallet private key');
  
  const keypair = loadKeypairForSigning(password);
  // Convert secret key (Uint8Array) to base58 for Phantom/Solflare import
  const bs58Chars = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
  let result = '';
  let bytes = Array.from(keypair.secretKey);
  
  while (bytes.length) {
    let carry = 0;
    const newBytes: number[] = [];
    for (const byte of bytes) {
      carry = carry * 256 + byte;
      if (newBytes.length || carry >= 58) {
        newBytes.push(Math.floor(carry / 58));
        carry %= 58;
      }
    }
    result = bs58Chars[carry] + result;
    bytes = newBytes;
  }
  
  // Add leading '1's for leading zero bytes
  for (const byte of keypair.secretKey) {
    if (byte === 0) result = '1' + result;
    else break;
  }
  
  return result;
}
