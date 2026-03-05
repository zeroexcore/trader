import fs from 'fs';
import path from 'path';
import { paths, apis, tokens, requireHeliusKey } from '../config.js';

// Legacy positions file for migration
const LEGACY_POSITIONS_FILE = path.join(process.cwd(), 'positions.json');

// Ensure directory exists with secure permissions
function ensureSecureDir(): void {
  const openclawDir = paths.openclawDir();
  if (!fs.existsSync(openclawDir)) {
    fs.mkdirSync(openclawDir, { mode: 0o700, recursive: true });
  }
}

/**
 * Migrate positions from legacy location (./positions.json) to secure location
 */
function migrateFromLegacy(): void {
  const positionsFile = paths.positionsFile();
  
  // If new file exists, no need to migrate
  if (fs.existsSync(positionsFile)) {
    return;
  }
  
  // Check if legacy file exists
  if (fs.existsSync(LEGACY_POSITIONS_FILE)) {
    try {
      ensureSecureDir();
      const content = fs.readFileSync(LEGACY_POSITIONS_FILE, 'utf-8');
      const data = JSON.parse(content);
      
      // Write to new secure location
      fs.writeFileSync(positionsFile, JSON.stringify(data, null, 2), {
        encoding: 'utf-8',
        mode: 0o600
      });
      
      console.log(`📦 Migrated ${data.positions?.length || 0} positions to secure location: ${positionsFile}`);
      console.log(`⚠️  You can delete the old file: ${LEGACY_POSITIONS_FILE}`);
    } catch (error) {
      console.warn('Failed to migrate positions from legacy location:', error);
    }
  }
}

export interface Position {
  id: string;
  type: 'long' | 'short' | 'prediction';
  token: string;
  tokenSymbol: string;
  entryPrice: number;
  entryAmount: number;
  entryValueUsd: number;
  entryDate: string;
  targetPrice?: number;
  stopLoss?: number;
  status: 'open' | 'closed' | 'won' | 'lost';
  exitPrice?: number;
  exitAmount?: number;
  exitValueUsd?: number;
  exitDate?: string;
  pnl?: number;
  pnlPercent?: number;
  durationMs?: number; // milliseconds held
  notes?: string;
  tags?: string[];
  // Transaction signatures for on-chain verification
  entryTxSignature?: string;
  exitTxSignature?: string;
  // Current price tracking for unrealized PnL
  currentPrice?: number;
  currentPriceUpdatedAt?: string;
  // Prediction market fields
  prediction?: {
    marketId: string;
    eventTitle: string;
    marketTitle: string;
    side: 'yes' | 'no';
    contracts: number;
    payoutIfWin: number;
    positionPubkey?: string;
    txSignature: string;
  };
}

export interface PositionsData {
  positions: Position[];
  lastUpdated: string;
}

/**
 * Load positions from file
 */
export function loadPositions(): PositionsData {
  ensureSecureDir();
  
  // Migrate from legacy location if needed
  migrateFromLegacy();
  
  const positionsFile = paths.positionsFile();
  try {
    if (fs.existsSync(positionsFile)) {
      const content = fs.readFileSync(positionsFile, 'utf-8');
      return JSON.parse(content);
    }
  } catch (error) {
    console.warn('Failed to load positions:', error);
  }
  
  return {
    positions: [],
    lastUpdated: new Date().toISOString(),
  };
}

/**
 * Get the positions file path (for documentation/debugging)
 */
export function getPositionsFilePath(): string {
  return paths.positionsFile();
}

/**
 * Save positions to file with secure permissions
 */
export function savePositions(data: PositionsData): void {
  ensureSecureDir();
  
  const positionsFile = paths.positionsFile();
  try {
    data.lastUpdated = new Date().toISOString();
    fs.writeFileSync(positionsFile, JSON.stringify(data, null, 2), { 
      encoding: 'utf-8',
      mode: 0o600  // Only owner can read/write
    });
  } catch (error) {
    console.error('Failed to save positions:', error);
  }
}

/**
 * Open a new position
 */
export function openPosition(params: {
  type: 'long' | 'short';
  token: string;
  tokenSymbol: string;
  entryPrice: number;
  entryAmount: number;
  targetPrice?: number;
  stopLoss?: number;
  notes?: string;
  tags?: string[];
  entryTxSignature?: string;
}): Position {
  const data = loadPositions();
  
  const position: Position = {
    id: `pos_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    type: params.type,
    token: params.token,
    tokenSymbol: params.tokenSymbol,
    entryPrice: params.entryPrice,
    entryAmount: params.entryAmount,
    entryValueUsd: params.entryPrice * params.entryAmount,
    entryDate: new Date().toISOString(),
    targetPrice: params.targetPrice,
    stopLoss: params.stopLoss,
    status: 'open',
    notes: params.notes,
    tags: params.tags,
    entryTxSignature: params.entryTxSignature,
  };
  
  data.positions.push(position);
  savePositions(data);
  
  return position;
}

/**
 * Close a position
 */
export function closePosition(
  positionId: string, 
  exitPrice: number, 
  exitAmount: number,
  options?: {
    exitTxSignature?: string;
    notes?: string;
  }
): Position | null {
  const data = loadPositions();
  const position = data.positions.find(p => p.id === positionId);
  
  if (!position) {
    console.error('Position not found:', positionId);
    return null;
  }
  
  if (position.status === 'closed') {
    console.warn('Position already closed:', positionId);
    return position;
  }
  
  const exitDate = new Date();
  const entryDate = new Date(position.entryDate);
  
  position.status = 'closed';
  position.exitPrice = exitPrice;
  position.exitAmount = exitAmount;
  position.exitDate = exitDate.toISOString();
  
  // Calculate exit value and PnL
  const exitValue = exitPrice * exitAmount;
  position.exitValueUsd = exitValue;
  
  // PnL calculation depends on position type
  if (position.type === 'long') {
    position.pnl = exitValue - position.entryValueUsd;
  } else {
    // Short position: profit when price goes down
    position.pnl = position.entryValueUsd - exitValue;
  }
  
  position.pnlPercent = (position.pnl / position.entryValueUsd) * 100;
  position.durationMs = exitDate.getTime() - entryDate.getTime();
  
  if (options?.exitTxSignature) {
    position.exitTxSignature = options.exitTxSignature;
  }
  
  if (options?.notes) {
    position.notes = position.notes 
      ? `${position.notes}\n[Exit] ${options.notes}`
      : `[Exit] ${options.notes}`;
  }
  
  savePositions(data);
  
  return position;
}

/**
 * Get open positions
 */
export function getOpenPositions(): Position[] {
  const data = loadPositions();
  return data.positions.filter(p => p.status === 'open');
}

/**
 * Get all positions
 */
export function getAllPositions(): Position[] {
  const data = loadPositions();
  return data.positions;
}

/**
 * Get position by ID
 */
export function getPosition(positionId: string): Position | null {
  const data = loadPositions();
  return data.positions.find(p => p.id === positionId) || null;
}

/**
 * Update position notes
 */
export function updatePositionNotes(positionId: string, notes: string, append: boolean = false): void {
  const data = loadPositions();
  const position = data.positions.find(p => p.id === positionId);
  
  if (position) {
    if (append && position.notes) {
      position.notes = `${position.notes}\n${notes}`;
    } else {
      position.notes = notes;
    }
    savePositions(data);
  }
}

/**
 * Add tags to a position
 */
export function addPositionTags(positionId: string, tags: string[]): void {
  const data = loadPositions();
  const position = data.positions.find(p => p.id === positionId);
  
  if (position) {
    const existingTags = position.tags || [];
    const newTags = [...new Set([...existingTags, ...tags])];
    position.tags = newTags;
    savePositions(data);
  }
}

/**
 * Get positions by tag
 */
export function getPositionsByTag(tag: string): Position[] {
  const data = loadPositions();
  return data.positions.filter(p => p.tags?.includes(tag));
}

/**
 * Format duration in human readable format
 */
function formatDuration(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);
  
  if (days > 0) {
    return `${days}d ${hours % 24}h`;
  } else if (hours > 0) {
    return `${hours}h ${minutes % 60}m`;
  } else if (minutes > 0) {
    return `${minutes}m`;
  } else {
    return `${seconds}s`;
  }
}

/**
 * Fetch current price for a token from Helius DAS API
 */
async function fetchTokenPrice(mint: string): Promise<number> {
  const heliusApiKey = requireHeliusKey();
  const url = apis.heliusRpc(heliusApiKey);
  
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 'price-fetch',
      method: 'getAsset',
      params: { id: mint },
    }),
  });

  const data = await response.json() as any;
  
  if (data.error) {
    throw new Error(`Helius API error: ${data.error.message}`);
  }

  const price = data.result?.token_info?.price_info?.price_per_token;
  
  if (price === undefined || price === null) {
    // Fallback to Jupiter quote API
    try {
      const decimals = data.result?.token_info?.decimals || 9;
      const quoteUrl = new URL(apis.jupiterQuote);
      quoteUrl.searchParams.append('inputMint', mint);
      quoteUrl.searchParams.append('outputMint', tokens.USDC);
      quoteUrl.searchParams.append('amount', Math.pow(10, decimals).toString()); // 1 token
      
      const quoteResponse = await fetch(quoteUrl.toString());
      const quoteData = await quoteResponse.json() as any;
      
      if (quoteData.outAmount) {
        return parseFloat(quoteData.outAmount) / 1e6; // USDC has 6 decimals
      }
    } catch (e) {
      // Continue to throw
    }
    throw new Error(`No price available for ${mint}`);
  }

  return price;
}

export interface PriceUpdateResult {
  positionId: string;
  tokenSymbol: string;
  previousPrice?: number;
  currentPrice: number;
  entryPrice: number;
  unrealizedPnl: number;
  unrealizedPnlPercent: number;
}

/**
 * Update current prices for all open positions
 */
export async function updatePositionPrices(): Promise<PriceUpdateResult[]> {
  const data = loadPositions();
  const openPositions = data.positions.filter(p => p.status === 'open');
  const results: PriceUpdateResult[] = [];
  const now = new Date().toISOString();

  for (const position of openPositions) {
    try {
      const currentPrice = await fetchTokenPrice(position.token);
      const previousPrice = position.currentPrice;
      
      position.currentPrice = currentPrice;
      position.currentPriceUpdatedAt = now;

      // Calculate unrealized PnL
      const currentValue = currentPrice * position.entryAmount;
      const unrealizedPnl = position.type === 'long' 
        ? currentValue - position.entryValueUsd
        : position.entryValueUsd - currentValue;
      const unrealizedPnlPercent = (unrealizedPnl / position.entryValueUsd) * 100;

      results.push({
        positionId: position.id,
        tokenSymbol: position.tokenSymbol,
        previousPrice,
        currentPrice,
        entryPrice: position.entryPrice,
        unrealizedPnl,
        unrealizedPnlPercent,
      });

      console.log(`  Updated ${position.tokenSymbol}: $${currentPrice.toFixed(4)} (entry: $${position.entryPrice.toFixed(4)}, PnL: ${unrealizedPnl >= 0 ? '+' : ''}$${unrealizedPnl.toFixed(2)} / ${unrealizedPnlPercent >= 0 ? '+' : ''}${unrealizedPnlPercent.toFixed(2)}%)`);
    } catch (error: any) {
      console.error(`  Failed to update ${position.tokenSymbol}: ${error.message}`);
    }
  }

  savePositions(data);
  return results;
}

/**
 * Display positions in a readable format
 */
export function displayPositions(positions: Position[]): void {
  if (positions.length === 0) {
    console.log('📊 No positions found');
    return;
  }
  
  console.log('\n📊 Positions:\n');
  
  for (const pos of positions) {
    // Handle prediction positions differently
    if (pos.type === 'prediction' && pos.prediction) {
      const statusEmoji = pos.status === 'open' ? '🟢' : pos.status === 'won' ? '🏆' : pos.status === 'lost' ? '❌' : '⚫';
      const sideEmoji = pos.prediction.side === 'yes' ? '✅' : '🚫';
      
      console.log(`${statusEmoji} ${sideEmoji} ${pos.prediction.marketTitle} (${pos.prediction.side.toUpperCase()})`);
      console.log(`   ID: ${pos.id}`);
      console.log(`   Market: ${pos.prediction.marketId}`);
      console.log(`   Event: ${pos.prediction.eventTitle}`);
      console.log(`   Contracts: ${pos.prediction.contracts} @ $${pos.entryPrice.toFixed(2)}`);
      console.log(`   Cost: $${pos.entryValueUsd.toFixed(2)}`);
      console.log(`   Payout if ${pos.prediction.side.toUpperCase()}: $${pos.prediction.payoutIfWin.toFixed(2)}`);
      console.log(`   Date: ${new Date(pos.entryDate).toLocaleString()}`);
      
      if (pos.status === 'won' || pos.status === 'lost') {
        const pnlEmoji = pos.pnl && pos.pnl >= 0 ? '💰' : '💸';
        console.log(`   Result: ${pos.status.toUpperCase()}`);
        console.log(`   PnL: ${pnlEmoji} ${pos.pnl && pos.pnl >= 0 ? '+' : ''}$${pos.pnl?.toFixed(2) || '0.00'}`);
      }
      
      if (pos.notes) {
        console.log(`   Notes: ${pos.notes}`);
      }
      console.log('');
      continue;
    }
    
    // Token positions
    const emoji = pos.type === 'long' ? '📈' : '📉';
    const statusEmoji = pos.status === 'open' ? '🟢' : '⚫';
    
    console.log(`${statusEmoji} ${emoji} ${pos.tokenSymbol} ${pos.type.toUpperCase()}`);
    console.log(`   ID: ${pos.id}`);
    console.log(`   Entry: $${pos.entryPrice.toFixed(4)} × ${pos.entryAmount.toFixed(4)} = $${pos.entryValueUsd.toFixed(2)}`);
    console.log(`   Date: ${new Date(pos.entryDate).toLocaleString()}`);
    
    // Show current price and unrealized PnL for open positions
    if (pos.status === 'open' && pos.currentPrice !== undefined) {
      const currentValue = pos.currentPrice * pos.entryAmount;
      const unrealizedPnl = pos.type === 'long' 
        ? currentValue - pos.entryValueUsd
        : pos.entryValueUsd - currentValue;
      const unrealizedPnlPercent = (unrealizedPnl / pos.entryValueUsd) * 100;
      const pnlEmoji = unrealizedPnl >= 0 ? '💰' : '💸';
      const priceChange = ((pos.currentPrice - pos.entryPrice) / pos.entryPrice) * 100;
      const priceEmoji = priceChange >= 0 ? '🟢' : '🔴';
      
      console.log(`   Current: ${priceEmoji} $${pos.currentPrice.toFixed(4)} (${priceChange >= 0 ? '+' : ''}${priceChange.toFixed(2)}%)`);
      console.log(`   Value: $${currentValue.toFixed(2)}`);
      console.log(`   Unrealized PnL: ${pnlEmoji} ${unrealizedPnl >= 0 ? '+' : ''}$${unrealizedPnl.toFixed(2)} (${unrealizedPnlPercent >= 0 ? '+' : ''}${unrealizedPnlPercent.toFixed(2)}%)`);
      
      if (pos.currentPriceUpdatedAt) {
        const updatedAgo = Math.round((Date.now() - new Date(pos.currentPriceUpdatedAt).getTime()) / 1000);
        const timeStr = updatedAgo < 60 ? `${updatedAgo}s ago` : updatedAgo < 3600 ? `${Math.round(updatedAgo/60)}m ago` : `${Math.round(updatedAgo/3600)}h ago`;
        console.log(`   Price Updated: ${timeStr}`);
      }
    }
    
    if (pos.targetPrice) {
      const targetPct = ((pos.targetPrice - pos.entryPrice) / pos.entryPrice) * 100;
      console.log(`   Target: $${pos.targetPrice.toFixed(4)} (${targetPct >= 0 ? '+' : ''}${targetPct.toFixed(2)}%)`);
    }
    
    if (pos.stopLoss) {
      const stopPct = ((pos.stopLoss - pos.entryPrice) / pos.entryPrice) * 100;
      console.log(`   Stop Loss: $${pos.stopLoss.toFixed(4)} (${stopPct >= 0 ? '+' : ''}${stopPct.toFixed(2)}%)`);
    }
    
    if (pos.status === 'closed' && pos.exitPrice && pos.pnl !== undefined) {
      const pnlEmoji = pos.pnl >= 0 ? '💰' : '💸';
      const exitAmount = pos.exitAmount ?? pos.entryAmount;
      const exitValue = pos.exitValueUsd ?? (pos.exitPrice * exitAmount);
      const pnlPct = pos.pnlPercent ?? ((pos.pnl / pos.entryValueUsd) * 100);
      
      console.log(`   Exit: $${pos.exitPrice.toFixed(4)} × ${exitAmount.toFixed(4)} = $${exitValue.toFixed(2)}`);
      console.log(`   PnL: ${pnlEmoji} ${pos.pnl >= 0 ? '+' : ''}$${pos.pnl.toFixed(2)} (${pnlPct >= 0 ? '+' : ''}${pnlPct.toFixed(2)}%)`);
      console.log(`   Closed: ${new Date(pos.exitDate!).toLocaleString()}`);
      
      if (pos.durationMs) {
        console.log(`   Duration: ${formatDuration(pos.durationMs)}`);
      }
      
      if (pos.exitTxSignature) {
        console.log(`   Exit Tx: ${pos.exitTxSignature.slice(0, 20)}...`);
      }
    }
    
    if (pos.tags && pos.tags.length > 0) {
      console.log(`   Tags: ${pos.tags.join(', ')}`);
    }
    
    if (pos.entryTxSignature) {
      console.log(`   Entry Tx: ${pos.entryTxSignature.slice(0, 20)}...`);
    }
    
    if (pos.notes) {
      console.log(`   Notes: ${pos.notes}`);
    }
    
    console.log('');
  }
}

/**
 * Calculate total PnL from closed positions
 */
export function calculateTotalPnL(): { realized: number; count: number } {
  const data = loadPositions();
  const closedPositions = data.positions.filter(p => (p.status === 'closed' || p.status === 'won' || p.status === 'lost') && p.pnl !== undefined);
  
  const realized = closedPositions.reduce((sum, p) => sum + (p.pnl || 0), 0);
  
  return {
    realized,
    count: closedPositions.length,
  };
}

export interface PositionStats {
  totalPositions: number;
  openPositions: number;
  closedPositions: number;
  totalInvested: number;
  currentOpenValue: number;
  realizedPnl: number;
  unrealizedPnl: number;
  winCount: number;
  lossCount: number;
  winRate: number;
  avgWin: number;
  avgLoss: number;
  avgHoldTime: number; // in hours
  bestTrade: { symbol: string; pnl: number; pnlPercent: number } | null;
  worstTrade: { symbol: string; pnl: number; pnlPercent: number } | null;
  byType: {
    long: { count: number; pnl: number };
    short: { count: number; pnl: number };
    prediction: { count: number; pnl: number };
  };
}

/**
 * Calculate comprehensive position statistics
 */
export function getPositionStats(): PositionStats {
  const data = loadPositions();
  const positions = data.positions;
  
  const openPos = positions.filter(p => p.status === 'open');
  const closedPos = positions.filter(p => p.status === 'closed' || p.status === 'won' || p.status === 'lost');
  
  // Wins and losses
  const wins = closedPos.filter(p => (p.pnl || 0) > 0);
  const losses = closedPos.filter(p => (p.pnl || 0) <= 0);
  
  // PnL calculations
  const realizedPnl = closedPos.reduce((sum, p) => sum + (p.pnl || 0), 0);
  
  // Unrealized PnL for open positions with current prices
  let unrealizedPnl = 0;
  let currentOpenValue = 0;
  for (const pos of openPos) {
    if (pos.currentPrice !== undefined) {
      const currentValue = pos.currentPrice * pos.entryAmount;
      currentOpenValue += currentValue;
      if (pos.type === 'long') {
        unrealizedPnl += currentValue - pos.entryValueUsd;
      } else if (pos.type === 'short') {
        unrealizedPnl += pos.entryValueUsd - currentValue;
      }
    } else {
      currentOpenValue += pos.entryValueUsd;
    }
  }
  
  // Average hold time (for positions with duration)
  const durationsMs = closedPos
    .filter(p => p.durationMs !== undefined)
    .map(p => p.durationMs!);
  const avgHoldTime = durationsMs.length > 0
    ? (durationsMs.reduce((a, b) => a + b, 0) / durationsMs.length) / (1000 * 60 * 60)
    : 0;
  
  // Best and worst trades
  let bestTrade: PositionStats['bestTrade'] = null;
  let worstTrade: PositionStats['worstTrade'] = null;
  
  for (const pos of closedPos) {
    if (pos.pnl === undefined) continue;
    const pnlPct = pos.pnlPercent ?? ((pos.pnl / pos.entryValueUsd) * 100);
    
    if (!bestTrade || pos.pnl > bestTrade.pnl) {
      bestTrade = { symbol: pos.tokenSymbol, pnl: pos.pnl, pnlPercent: pnlPct };
    }
    if (!worstTrade || pos.pnl < worstTrade.pnl) {
      worstTrade = { symbol: pos.tokenSymbol, pnl: pos.pnl, pnlPercent: pnlPct };
    }
  }
  
  // By type
  const byType = {
    long: { count: 0, pnl: 0 },
    short: { count: 0, pnl: 0 },
    prediction: { count: 0, pnl: 0 },
  };
  
  for (const pos of closedPos) {
    if (pos.type in byType) {
      byType[pos.type].count++;
      byType[pos.type].pnl += pos.pnl || 0;
    }
  }
  
  return {
    totalPositions: positions.length,
    openPositions: openPos.length,
    closedPositions: closedPos.length,
    totalInvested: openPos.reduce((sum, p) => sum + p.entryValueUsd, 0),
    currentOpenValue,
    realizedPnl,
    unrealizedPnl,
    winCount: wins.length,
    lossCount: losses.length,
    winRate: closedPos.length > 0 ? (wins.length / closedPos.length) * 100 : 0,
    avgWin: wins.length > 0 ? wins.reduce((sum, p) => sum + (p.pnl || 0), 0) / wins.length : 0,
    avgLoss: losses.length > 0 ? losses.reduce((sum, p) => sum + (p.pnl || 0), 0) / losses.length : 0,
    avgHoldTime,
    bestTrade,
    worstTrade,
    byType,
  };
}

/**
 * Open a prediction market position
 */
export function openPredictionPosition(params: {
  marketId: string;
  eventTitle: string;
  marketTitle: string;
  side: 'yes' | 'no';
  contracts: number;
  entryPrice: number;
  costUsd: number;
  payoutIfWin: number;
  txSignature: string;
  positionPubkey?: string;
  notes?: string;
}): Position {
  const data = loadPositions();
  
  const position: Position = {
    id: `pred_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    type: 'prediction',
    token: params.marketId,
    tokenSymbol: `${params.side.toUpperCase()} ${params.marketTitle}`,
    entryPrice: params.entryPrice,
    entryAmount: params.contracts,
    entryValueUsd: params.costUsd,
    entryDate: new Date().toISOString(),
    status: 'open',
    notes: params.notes,
    prediction: {
      marketId: params.marketId,
      eventTitle: params.eventTitle,
      marketTitle: params.marketTitle,
      side: params.side,
      contracts: params.contracts,
      payoutIfWin: params.payoutIfWin,
      positionPubkey: params.positionPubkey,
      txSignature: params.txSignature,
    },
  };
  
  data.positions.push(position);
  savePositions(data);
  
  return position;
}

/**
 * Close a prediction position (won or lost)
 */
export function closePredictionPosition(
  positionId: string, 
  outcome: 'won' | 'lost',
  payoutUsd?: number
): Position | null {
  const data = loadPositions();
  const position = data.positions.find(p => p.id === positionId);
  
  if (!position || position.type !== 'prediction') {
    console.error('Prediction position not found:', positionId);
    return null;
  }
  
  position.status = outcome;
  position.exitDate = new Date().toISOString();
  
  const contracts = position.prediction?.contracts ?? position.entryAmount;
  if (outcome === 'won') {
    const payout = payoutUsd ?? position.prediction?.payoutIfWin ?? 0;
    position.exitPrice = 1; // Contract settled at $1
    position.exitAmount = contracts;
    position.exitValueUsd = payout;
    position.pnl = payout - position.entryValueUsd;
  } else {
    position.exitPrice = 0; // Contract settled at $0
    position.exitAmount = contracts;
    position.exitValueUsd = 0;
    position.pnl = -position.entryValueUsd;
  }
  position.pnlPercent = (position.pnl / position.entryValueUsd) * 100;
  
  savePositions(data);
  return position;
}

/**
 * Find prediction position by market ID
 */
export function findPredictionByMarket(marketId: string, side?: 'yes' | 'no'): Position | null {
  const data = loadPositions();
  return data.positions.find(p => 
    p.type === 'prediction' && 
    p.prediction?.marketId === marketId &&
    p.status === 'open' &&
    (side === undefined || p.prediction?.side === side)
  ) || null;
}

/**
 * Find prediction position by on-chain position pubkey
 */
export function findPredictionByPubkey(positionPubkey: string): Position | null {
  const data = loadPositions();
  return data.positions.find(p => 
    p.type === 'prediction' && 
    p.prediction?.positionPubkey === positionPubkey &&
    p.status === 'open'
  ) || null;
}

/**
 * Get all prediction positions
 */
export function getPredictionPositions(status?: 'open' | 'won' | 'lost' | 'all'): Position[] {
  const data = loadPositions();
  return data.positions.filter(p => {
    if (p.type !== 'prediction') return false;
    if (!status || status === 'all') return true;
    return p.status === status;
  });
}
