import { Connection } from '@solana/web3.js';
import { Command } from 'commander';
import { toSmallestUnit } from '../../utils/amounts.js';
import {
  buildIncreasePositionTransaction,
  signAndSendPerps,
  assetToMint,
  perpsTokenDecimals,
  DEFAULT_SLIPPAGE_BPS,
  type PerpsAsset,
  type PerpsSide,
  type PerpsToken,
} from '../../utils/perps-api.js';
import { loadKeypairForSigning, getWalletAddress } from '../../utils/wallet.js';
import { output, action, requirePassword, getRpcUrl } from '../shared.js';

export const openCommand = new Command('open')
  .argument('<market>', 'Market: SOL, ETH, BTC')
  .argument('<side>', 'Side: long, short')
  .argument('<token>', 'Payment token: SOL, ETH, BTC, USDC')
  .argument('<amount>', 'Amount of payment token')
  .option('--leverage <leverage>', 'Leverage multiplier (e.g. 5 for 5x)')
  .option('--slippage <bps>', `Price slippage tolerance in bps (default: ${DEFAULT_SLIPPAGE_BPS})`)
  .option('-n, --note <note>', 'Trading journal note')
  .description('Open a new perps position (e.g. perps open SOL long SOL 0.06 --leverage 2)')
  .action(action(async (market, side, token, amount, options) => {
    const password = requirePassword();
    const asset = market.toUpperCase() as PerpsAsset;
    const sideNorm = side.toLowerCase() as PerpsSide;
    const inputToken = token.toUpperCase() as PerpsToken;
    const amountNum = parseFloat(amount);
    const slippageBps = options.slippage ? parseInt(options.slippage, 10) : DEFAULT_SLIPPAGE_BPS;

    if (!['long', 'short'].includes(sideNorm)) throw new Error('Side must be "long" or "short"');
    if (isNaN(amountNum) || amountNum <= 0) throw new Error(`Invalid amount: "${amount}"`);
    assetToMint(asset);

    const rpcUrl = getRpcUrl();
    const connection = new Connection(rpcUrl, 'confirmed');
    const walletAddress = getWalletAddress(password);
    const decimals = perpsTokenDecimals(inputToken);
    const inputTokenAmount = toSmallestUnit(amountNum, decimals);

    console.log(`\n${asset} ${sideNorm} — ${amountNum} ${inputToken}, ${options.leverage || 'auto'}x leverage, ${slippageBps} bps slippage`);

    const { tx, positionPubkey } = await buildIncreasePositionTransaction(connection, {
      asset,
      inputToken,
      inputTokenAmount,
      leverage: options.leverage,
      side: sideNorm,
      slippageBps,
      walletAddress,
    });

    console.log('Signing and submitting...');
    const keypair = loadKeypairForSigning(password);
    const txid = await signAndSendPerps(connection, keypair, tx);

    console.log(`\nPosition request submitted — keeper will execute shortly.`);
    console.log(`https://solscan.io/tx/${txid}`);

    output({
      txid,
      positionPubkey,
      asset,
      side: sideNorm,
      inputToken,
      amount: amountNum,
      leverage: options.leverage || 'auto',
      slippageBps,
      note: options.note,
    });
  }));
