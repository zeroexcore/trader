#!/usr/bin/env tsx
/**
 * Trade Grading Script
 * Analyzes closed positions and assigns grades based on execution quality
 */

import fs from 'fs';
import path from 'path';

interface Position {
  id: string;
  type: 'long' | 'short';
  tokenSymbol: string;
  entryPrice: number;
  entryAmount: number;
  entryValueUsd: number;
  entryDate: string;
  targetPrice?: number;
  stopLoss?: number;
  exitPrice?: number;
  exitDate?: string;
  pnl?: number;
  status: 'open' | 'closed';
  notes?: string;
}

interface TradeGrade {
  id: string;
  symbol: string;
  pnlPercent: number;
  grade: 'A' | 'B' | 'C' | 'D' | 'F';
  reason: string;
  hitTarget: boolean;
  hitStop: boolean;
  holdDays: number;
}

function loadPositions(): Position[] {
  const positionsPath = path.join(process.cwd(), 'positions.json');
  if (!fs.existsSync(positionsPath)) {
    console.error('❌ positions.json not found');
    process.exit(1);
  }
  const data = JSON.parse(fs.readFileSync(positionsPath, 'utf-8'));
  return data.positions || [];
}

function gradeTrade(pos: Position): TradeGrade | null {
  if (pos.status !== 'closed' || !pos.exitPrice || !pos.pnl) {
    return null;
  }

  const pnlPercent = (pos.pnl / pos.entryValueUsd) * 100;
  const entryDate = new Date(pos.entryDate);
  const exitDate = new Date(pos.exitDate!);
  const holdDays = Math.ceil((exitDate.getTime() - entryDate.getTime()) / (1000 * 60 * 60 * 24));

  const hitTarget = pos.targetPrice ? pos.exitPrice >= pos.targetPrice : false;
  const hitStop = pos.stopLoss ? pos.exitPrice <= pos.stopLoss : false;

  let grade: 'A' | 'B' | 'C' | 'D' | 'F';
  let reason: string;

  if (pnlPercent >= 15) {
    grade = 'A';
    reason = 'Excellent return (15%+)';
  } else if (pnlPercent >= 8) {
    grade = 'B';
    reason = 'Good return (8-15%)';
  } else if (pnlPercent >= 0) {
    grade = 'C';
    reason = 'Positive but modest (0-8%)';
  } else if (pnlPercent >= -5) {
    grade = 'D';
    reason = 'Small loss (-5% to 0%)';
  } else {
    grade = 'F';
    reason = 'Significant loss (>-5%)';
  }

  // Bonus/penalty adjustments
  if (hitTarget && pnlPercent > 0) {
    if (grade !== 'A') {
      reason += ' + Hit target';
    }
  }
  if (hitStop) {
    reason += ' - Hit stop loss';
  }

  return {
    id: pos.id,
    symbol: pos.tokenSymbol,
    pnlPercent,
    grade,
    reason,
    hitTarget,
    hitStop,
    holdDays,
  };
}

function main() {
  const positions = loadPositions();
  const closedPositions = positions.filter(p => p.status === 'closed');

  if (closedPositions.length === 0) {
    console.log('No closed positions to grade.');
    return;
  }

  console.log('\n📊 Trade Grades\n');
  console.log('═'.repeat(80));

  const grades: TradeGrade[] = [];
  
  for (const pos of closedPositions) {
    const grade = gradeTrade(pos);
    if (grade) {
      grades.push(grade);
    }
  }

  // Sort by date (most recent first)
  grades.sort((a, b) => b.pnlPercent - a.pnlPercent);

  for (const g of grades) {
    const emoji = g.grade === 'A' ? '🏆' : g.grade === 'B' ? '✅' : g.grade === 'C' ? '➖' : g.grade === 'D' ? '⚠️' : '❌';
    const pnlEmoji = g.pnlPercent >= 0 ? '📈' : '📉';
    
    console.log(`${emoji} ${g.symbol} - Grade: ${g.grade}`);
    console.log(`   ${pnlEmoji} PnL: ${g.pnlPercent >= 0 ? '+' : ''}${g.pnlPercent.toFixed(2)}%`);
    console.log(`   📝 ${g.reason}`);
    console.log(`   ⏱️  Held: ${g.holdDays} day(s)`);
    console.log(`   🎯 Target: ${g.hitTarget ? 'HIT' : 'missed'}  🛑 Stop: ${g.hitStop ? 'HIT' : 'safe'}`);
    console.log('');
  }

  // Summary stats
  const avgPnl = grades.reduce((sum, g) => sum + g.pnlPercent, 0) / grades.length;
  const gradeCount = { A: 0, B: 0, C: 0, D: 0, F: 0 };
  grades.forEach(g => gradeCount[g.grade]++);

  console.log('═'.repeat(80));
  console.log('\n📈 Summary\n');
  console.log(`Total Trades: ${grades.length}`);
  console.log(`Average PnL: ${avgPnl >= 0 ? '+' : ''}${avgPnl.toFixed(2)}%`);
  console.log(`Grade Distribution: A:${gradeCount.A} B:${gradeCount.B} C:${gradeCount.C} D:${gradeCount.D} F:${gradeCount.F}`);
  
  const winRate = (grades.filter(g => g.pnlPercent > 0).length / grades.length * 100).toFixed(1);
  console.log(`Win Rate: ${winRate}%`);
}

main();
