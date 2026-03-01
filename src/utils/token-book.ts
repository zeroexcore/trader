import fs from 'fs';
import path from 'path';

const TOKEN_BOOK_PATH = path.join(process.cwd(), 'tokens.json');

/**
 * Load token address book
 */
export function loadTokenBook(): Record<string, string> {
  try {
    if (fs.existsSync(TOKEN_BOOK_PATH)) {
      const content = fs.readFileSync(TOKEN_BOOK_PATH, 'utf-8');
      return JSON.parse(content);
    }
  } catch (error) {
    console.warn('Failed to load token book:', error);
  }
  return {};
}

/**
 * Save token address book
 */
export function saveTokenBook(book: Record<string, string>): void {
  try {
    fs.writeFileSync(TOKEN_BOOK_PATH, JSON.stringify(book, null, 2), 'utf-8');
  } catch (error) {
    console.error('Failed to save token book:', error);
  }
}

/**
 * Resolve token ticker to address
 * If input is already an address (long string), return as-is
 * If input is a ticker (short string), look up in address book
 */
export function resolveToken(tickerOrAddress: string): string {
  // If it looks like an address (long base58 string), return as-is
  if (tickerOrAddress.length > 32) {
    return tickerOrAddress;
  }

  // Otherwise, look up in token book
  const book = loadTokenBook();
  const upperTicker = tickerOrAddress.toUpperCase();
  
  if (book[upperTicker]) {
    return book[upperTicker];
  }

  // If not found, return original (might be a short address or will error later)
  return tickerOrAddress;
}

/**
 * Get ticker from address (reverse lookup)
 */
export function getTickerFromAddress(address: string): string | null {
  const book = loadTokenBook();
  
  for (const [ticker, addr] of Object.entries(book)) {
    if (addr === address) {
      return ticker;
    }
  }
  
  return null;
}

/**
 * Add token to address book
 */
export function addToken(ticker: string, address: string): void {
  const book = loadTokenBook();
  const upperTicker = ticker.toUpperCase();
  
  book[upperTicker] = address;
  saveTokenBook(book);
  
  console.log(`✅ Added ${upperTicker} → ${address}`);
}

/**
 * Remove token from address book
 */
export function removeToken(ticker: string): void {
  const book = loadTokenBook();
  const upperTicker = ticker.toUpperCase();
  
  if (book[upperTicker]) {
    delete book[upperTicker];
    saveTokenBook(book);
    console.log(`✅ Removed ${upperTicker}`);
  } else {
    console.log(`⚠️  ${upperTicker} not found in address book`);
  }
}

/**
 * List all tokens in address book
 */
export function listTokens(): void {
  const book = loadTokenBook();
  const entries = Object.entries(book);
  
  if (entries.length === 0) {
    console.log('📋 Token address book is empty');
    return;
  }
  
  console.log('\n📋 Token Address Book:\n');
  console.table(
    entries.map(([ticker, address]) => ({
      Ticker: ticker,
      Address: address,
    }))
  );
}
