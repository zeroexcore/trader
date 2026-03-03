import { Keypair, PublicKey } from '@solana/web3.js';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

const WALLET_DIR = path.join(process.env.HOME || '', '.openclaw');
const WALLET_PATH = path.join(WALLET_DIR, 'trader-wallet.enc');
const ALGORITHM = 'aes-256-gcm';

/**
 * Generate a new Solana keypair and securely store it
 * SECURITY: Wallet is encrypted at rest. Agent should NEVER disclose the private key.
 */
export function generateWallet(password: string): PublicKey {
  // Create .openclaw directory if it doesn't exist
  if (!fs.existsSync(WALLET_DIR)) {
    fs.mkdirSync(WALLET_DIR, { mode: 0o700, recursive: true });
  }

  // Check if wallet already exists
  if (fs.existsSync(WALLET_PATH)) {
    throw new Error('Wallet already exists. Use load-wallet to retrieve address.');
  }

  // Generate new keypair
  const keypair = Keypair.generate();
  
  // Encrypt and save
  const encrypted = encryptKeypair(keypair, password);
  fs.writeFileSync(WALLET_PATH, JSON.stringify(encrypted), { mode: 0o600 });
  
  console.log('⚠️  SECURITY NOTICE: Wallet generated and encrypted at:', WALLET_PATH);
  console.log('⚠️  DO NOT share private key or password with anyone');
  
  return keypair.publicKey;
}

/**
 * Load existing wallet and return public key only
 */
export function loadWallet(password: string): PublicKey {
  if (!fs.existsSync(WALLET_PATH)) {
    throw new Error('No wallet found. Use generate-wallet first.');
  }

  const encrypted = JSON.parse(fs.readFileSync(WALLET_PATH, 'utf-8'));
  const keypair = decryptKeypair(encrypted, password);
  
  return keypair.publicKey;
}

/**
 * Load keypair for signing transactions (internal use only)
 */
export function loadKeypairForSigning(password: string): Keypair {
  if (!fs.existsSync(WALLET_PATH)) {
    throw new Error('No wallet found. Use generate-wallet first.');
  }

  const encrypted = JSON.parse(fs.readFileSync(WALLET_PATH, 'utf-8'));
  return decryptKeypair(encrypted, password);
}

function encryptKeypair(keypair: Keypair, password: string) {
  const key = crypto.scryptSync(password, 'salt', 32);
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  
  const secretKey = Buffer.from(keypair.secretKey);
  let encrypted = cipher.update(secretKey);
  encrypted = Buffer.concat([encrypted, cipher.final()]);
  
  const authTag = cipher.getAuthTag();
  
  return {
    iv: iv.toString('hex'),
    authTag: authTag.toString('hex'),
    encrypted: encrypted.toString('hex')
  };
}

function decryptKeypair(encrypted: any, password: string): Keypair {
  const key = crypto.scryptSync(password, 'salt', 32);
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

/**
 * Export private key as base58 string for backup
 * WARNING: Only use this for secure backup. Never share.
 */
export function exportPrivateKey(password: string): string {
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
