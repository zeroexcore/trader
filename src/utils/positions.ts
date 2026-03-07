import fs from 'fs';
import path from 'path';
import { paths } from '../config.js';

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

interface Position {
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

interface PositionsData {
  positions: Position[];
  lastUpdated: string;
}

/**
 * Load positions from file
 */
function loadPositions(): PositionsData {
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
 * Save positions to file with secure permissions
 */
function savePositions(data: PositionsData): void {
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

interface PositionStats {
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

