import { Connection } from '@solana/web3.js';
import { Command } from 'commander';
import {
  getPerpsPositions,
  buildTpslTransaction,
  signAndSendPerps,
  formatUsd,
  assetToMint,
  type PerpsAsset,
  type PerpsSide,
  type PerpsToken,
} from '../../utils/perps-api.js';
import { loadKeypairForSigning, getWalletAddress } from '../../utils/wallet.js';
import { output, action, requirePassword, getRpcUrl } from '../shared.js';

export const tpslCommand = new Command('tpsl')
  .argument('<market>', 'Market: SOL, ETH, BTC')
  .argument('<side>', 'Side: long, short')
  .option('--tp <price>', 'Take-profit trigger price in USD')
  .option('--sl <price>', 'Stop-loss trigger price in USD')
  .option('--receive <token>', 'Token to receive (default: asset for longs, USDC for shorts)')
  .option('-n, --note <note>', 'Trading journal note')
  .description('Set take-profit and/or stop-loss on a perps position')
  .action(action(async (market, side, options) => {
    const password = requirePassword();
    const asset = market.toUpperCase() as PerpsAsset;
    const sideNorm = side.toLowerCase() as PerpsSide;

    if (!['long', 'short'].includes(sideNorm)) throw new Error('Side must be "long" or "short"');
    assetToMint(asset);

    const tpPrice = options.tp ? parseFloat(options.tp) : undefined;
    const slPrice = options.sl ? parseFloat(options.sl) : undefined;
    if (!tpPrice && !slPrice) throw new Error('At least one of --tp or --sl is required');

    const rpcUrl = getRpcUrl();
    const connection = new Connection(rpcUrl, 'confirmed');
    const walletAddress = getWalletAddress(password);

    const { dataList } = await getPerpsPositions(walletAddress, connection);
    const pos = dataList.find(p => p.asset.toUpperCase() === asset && p.side === sideNorm);
    if (!pos) throw new Error(`No open ${asset} ${sideNorm} position found`);

    const defaultReceive = sideNorm === 'long' ? asset : 'USDC';
    const receiveToken = (options.receive || defaultReceive).toUpperCase() as PerpsToken;

    const entry = formatUsd(pos.entryPriceUsd);
    console.log(`\nSetting TP/SL on ${asset} ${sideNorm} — ${formatUsd(pos.sizeUsd)} @ ${entry}`);
    if (tpPrice) console.log(`  Take-profit: $${tpPrice}`);
    if (slPrice) console.log(`  Stop-loss: $${slPrice}`);
    console.log(`  Receive: ${receiveToken}`);

    // Sanity checks
    const entryNum = Number(pos.entryPriceUsd) / 1_000_000;
    if (sideNorm === 'long') {
      if (tpPrice && tpPrice <= entryNum) console.log(`  ⚠ TP ($${tpPrice}) is below entry ($${entryNum.toFixed(2)}) — unusual for a long`);
      if (slPrice && slPrice >= entryNum) console.log(`  ⚠ SL ($${slPrice}) is above entry ($${entryNum.toFixed(2)}) — unusual for a long`);
    } else {
      if (tpPrice && tpPrice >= entryNum) console.log(`  ⚠ TP ($${tpPrice}) is above entry ($${entryNum.toFixed(2)}) — unusual for a short`);
      if (slPrice && slPrice <= entryNum) console.log(`  ⚠ SL ($${slPrice}) is below entry ($${entryNum.toFixed(2)}) — unusual for a short`);
    }

    const { tx } = await buildTpslTransaction(connection, {
      positionPubkey: pos.positionPubkey,
      side: sideNorm,
      asset,
      receiveToken,
      tpPrice,
      slPrice,
    });

    console.log('Signing and submitting...');
    const keypair = loadKeypairForSigning(password);
    const txid = await signAndSendPerps(connection, keypair, tx);

    const orders = [tpPrice && 'TP', slPrice && 'SL'].filter(Boolean).join(' + ');
    console.log(`\n${orders} order(s) created — keepers will execute when trigger price is hit.`);
    console.log(`https://solscan.io/tx/${txid}`);

    output({
      txid,
      positionPubkey: pos.positionPubkey,
      asset,
      side: sideNorm,
      receive: receiveToken,
      tpPrice,
      slPrice,
      note: options.note,
    });
  }));
