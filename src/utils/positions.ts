import fs from 'fs';
import path from 'path';

const POSITIONS_FILE = path.join(process.cwd(), 'positions.json');

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
  exitDate?: string;
  pnl?: number;
  notes?: string;
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
  try {
    if (fs.existsSync(POSITIONS_FILE)) {
      const content = fs.readFileSync(POSITIONS_FILE, 'utf-8');
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
 * Save positions to file
 */
export function savePositions(data: PositionsData): void {
  try {
    data.lastUpdated = new Date().toISOString();
    fs.writeFileSync(POSITIONS_FILE, JSON.stringify(data, null, 2), 'utf-8');
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
  };
  
  data.positions.push(position);
  savePositions(data);
  
  return position;
}

/**
 * Close a position
 */
export function closePosition(positionId: string, exitPrice: number, exitAmount: number): Position | null {
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
  
  position.status = 'closed';
  position.exitPrice = exitPrice;
  position.exitDate = new Date().toISOString();
  
  // Calculate PnL
  const exitValue = exitPrice * exitAmount;
  position.pnl = exitValue - position.entryValueUsd;
  
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
export function updatePositionNotes(positionId: string, notes: string): void {
  const data = loadPositions();
  const position = data.positions.find(p => p.id === positionId);
  
  if (position) {
    position.notes = notes;
    savePositions(data);
  }
}

/**
 * Fetch current price for a token from Helius DAS API
 */
async function fetchTokenPrice(mint: string): Promise<number> {
  const heliusApiKey = process.env.HELIUS_API_KEY;
  if (!heliusApiKey) {
    throw new Error('HELIUS_API_KEY not set in environment');
  }

  const url = `https://mainnet.helius-rpc.com/?api-key=${heliusApiKey}`;
  
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
      const quoteUrl = new URL('https://quote-api.jup.ag/v6/quote');
      quoteUrl.searchParams.append('inputMint', mint);
      quoteUrl.searchParams.append('outputMint', 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v'); // USDC
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
      console.log(`   Exit: $${pos.exitPrice.toFixed(4)}`);
      console.log(`   PnL: ${pnlEmoji} ${pos.pnl >= 0 ? '+' : ''}$${pos.pnl.toFixed(2)} (${((pos.pnl / pos.entryValueUsd) * 100).toFixed(2)}%)`);
      console.log(`   Closed: ${new Date(pos.exitDate!).toLocaleString()}`);
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
  
  if (outcome === 'won') {
    const payout = payoutUsd ?? position.prediction?.payoutIfWin ?? 0;
    position.exitPrice = 1; // Contract settled at $1
    position.pnl = payout - position.entryValueUsd;
  } else {
    position.exitPrice = 0; // Contract settled at $0
    position.pnl = -position.entryValueUsd;
  }
  
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
