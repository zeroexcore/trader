import { Connection } from '@solana/web3.js';
import { Command } from 'commander';
import {
  getPerpsPositions,
  buildDecreasePositionTransaction,
  signAndSendPerps,
  formatUsd,
  assetToMint,
  DEFAULT_SLIPPAGE_BPS,
  type PerpsAsset,
  type PerpsSide,
  type PerpsToken,
} from '../../utils/perps-api.js';
import { loadKeypairForSigning, getWalletAddress } from '../../utils/wallet.js';
import { output, action, requirePassword, getRpcUrl } from '../shared.js';

export const closeCommand = new Command('close')
  .argument('<market>', 'Market: SOL, ETH, BTC')
  .argument('<side>', 'Side: long, short')
  .option('--receive <token>', 'Token to receive (default: asset for longs, USDC for shorts)')
  .option('--slippage <bps>', `Price slippage in bps (default: ${DEFAULT_SLIPPAGE_BPS})`)
  .option('-n, --note <note>', 'Trading journal note')
  .description('Close a perps position (e.g. perps close BTC short)')
  .action(action(async (market, side, options) => {
    const password = requirePassword();
    const asset = market.toUpperCase() as PerpsAsset;
    const sideNorm = side.toLowerCase() as PerpsSide;
    const slippageBps = options.slippage ? parseInt(options.slippage, 10) : DEFAULT_SLIPPAGE_BPS;

    if (!['long', 'short'].includes(sideNorm)) throw new Error('Side must be "long" or "short"');
    assetToMint(asset);

    const rpcUrl = getRpcUrl();
    const connection = new Connection(rpcUrl, 'confirmed');
    const walletAddress = getWalletAddress(password);

    const { dataList } = await getPerpsPositions(walletAddress, connection);
    const pos = dataList.find(p => p.asset.toUpperCase() === asset && p.side === sideNorm);
    if (!pos) throw new Error(`No open ${asset} ${sideNorm} position found`);

    const defaultReceive = sideNorm === 'long' ? asset : 'USDC';
    const receiveToken = (options.receive || defaultReceive).toUpperCase() as PerpsToken;

    console.log(`\nClosing ${asset} ${sideNorm} — ${formatUsd(pos.sizeUsd)} @ ${formatUsd(pos.entryPriceUsd)}`);
    console.log(`  Receive: ${receiveToken}, slippage: ${slippageBps} bps`);

    const { tx } = await buildDecreasePositionTransaction(
      connection,
      { positionPubkey: pos.positionPubkey, receiveToken, entirePosition: true, slippageBps },
      { side: sideNorm, asset },
    );

    console.log('Signing and submitting...');
    const keypair = loadKeypairForSigning(password);
    const txid = await signAndSendPerps(connection, keypair, tx);

    console.log(`\nClose request submitted — keeper will execute shortly.`);
    console.log(`https://solscan.io/tx/${txid}`);

    output({
      txid,
      positionPubkey: pos.positionPubkey,
      asset,
      side: sideNorm,
      receive: receiveToken,
      slippageBps,
      note: options.note,
    });
  }));
