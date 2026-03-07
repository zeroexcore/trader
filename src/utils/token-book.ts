import fs from 'fs';
import path from 'path';
import { PublicKey } from '@solana/web3.js';
import { paths, defaultTokenBook } from '../config.js';

const LEGACY_TOKEN_BOOK_PATH = path.join(process.cwd(), 'tokens.json');

function ensureDir(): void {
  const dir = paths.openclawDir();
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { mode: 0o700, recursive: true });
  }
}

/** Migrate from legacy ./tokens.json to ~/.openclaw/trader-tokens.json */
function migrateFromLegacy(): void {
  const target = paths.tokenBook();
  if (fs.existsSync(target)) return;
  
  if (fs.existsSync(LEGACY_TOKEN_BOOK_PATH)) {
    try {
      ensureDir();
      const content = fs.readFileSync(LEGACY_TOKEN_BOOK_PATH, 'utf-8');
      fs.writeFileSync(target, content, { encoding: 'utf-8', mode: 0o600 });
      console.log(`📦 Migrated token book to ${target}`);
    } catch {
      // Fall through to defaults
    }
  }
}

/** Load token address book - merges defaults with user additions */
export function loadTokenBook(): Record<string, string> {
  ensureDir();
  migrateFromLegacy();
  
  const bookPath = paths.tokenBook();
  let userBook: Record<string, string> = {};
  
  try {
    if (fs.existsSync(bookPath)) {
      userBook = JSON.parse(fs.readFileSync(bookPath, 'utf-8'));
    }
  } catch {
    // Fall through to defaults
  }
  
  // Defaults first, user overrides on top
  return { ...defaultTokenBook, ...userBook };
}

/** Save token address book */
export function saveTokenBook(book: Record<string, string>): void {
  ensureDir();
  fs.writeFileSync(paths.tokenBook(), JSON.stringify(book, null, 2), {
    encoding: 'utf-8',
    mode: 0o600,
  });
}

/** Resolve ticker to address. Passes through if already an address. */
export function resolveToken(tickerOrAddress: string): string {
  if (tickerOrAddress.length > 32) {
    // Validate as Solana public key (base58)
    try {
      new PublicKey(tickerOrAddress);
    } catch {
      throw new Error(`Invalid Solana address: "${tickerOrAddress}"`);
    }
    return tickerOrAddress;
  }
  
  const book = loadTokenBook();
  // Case-insensitive lookup — handles mixed-case keys like JupUSD, GLDx
  const upper = tickerOrAddress.toUpperCase();
  for (const [key, value] of Object.entries(book)) {
    if (key.toUpperCase() === upper) return value;
  }
  return tickerOrAddress;
}

/** Reverse lookup: address → ticker */
export function getTickerFromAddress(address: string): string | null {
  const book = loadTokenBook();
  for (const [ticker, addr] of Object.entries(book)) {
    if (addr === address) return ticker;
  }
  return null;
}
