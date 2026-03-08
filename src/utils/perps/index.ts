import { AnchorProvider, Program, Wallet } from "@coral-xyz/anchor"
import BN from "bn.js"
import {
  ComputeBudgetProgram,
  Connection,
  Keypair,
  PublicKey,
  SystemProgram,
  TransactionInstruction,
  TransactionMessage,
  VersionedTransaction,
} from "@solana/web3.js"
import {
  createAssociatedTokenAccountIdempotentInstruction,
  createCloseAccountInstruction,
  createSyncNativeInstruction,
  getAssociatedTokenAddressSync,
  NATIVE_MINT,
  TOKEN_PROGRAM_ID,
  ASSOCIATED_TOKEN_PROGRAM_ID,
} from "@solana/spl-token"
import Big from "big.js"
import { perps as perpsConfig, tokens } from "../../config.js"
import IDL from "./idl.json" with { type: "json" }

// ============================================================================
// Constants
// ============================================================================

const PROGRAM_ID = new PublicKey(perpsConfig.programId)
const POOL = new PublicKey(perpsConfig.poolAccount)

const PERPETUALS_PDA = PublicKey.findProgramAddressSync(
  [Buffer.from("perpetuals")],
  PROGRAM_ID,
)[0]

const EVENT_AUTHORITY = PublicKey.findProgramAddressSync(
  [Buffer.from("__event_authority")],
  PROGRAM_ID,
)[0]

const CUSTODY = {
  SOL: new PublicKey(perpsConfig.custody.SOL),
  ETH: new PublicKey(perpsConfig.custody.ETH),
  BTC: new PublicKey(perpsConfig.custody.BTC),
  USDC: new PublicKey(perpsConfig.custody.USDC),
  USDT: new PublicKey(perpsConfig.custody.USDT),
} as const

const CUSTODY_NAMES = Object.fromEntries(
  Object.entries(CUSTODY).map(([k, v]) => [v.toBase58(), k])
)

// Mints for each perps market
const MARKET_MINTS: Record<string, PublicKey> = {
  SOL: NATIVE_MINT,
  ETH: new PublicKey(tokens.WETH),
  BTC: new PublicKey(tokens.WBTC),
  USDC: new PublicKey(tokens.USDC),
  USDT: new PublicKey(tokens.USDT),
}

const USDC_DECIMALS = 6

// ============================================================================
// Types
// ============================================================================

export type Side = "long" | "short"

export type PerpsPosition = {
  publicKey: string
  owner: string
  side: Side
  custody: string
  custodyPubkey: string
  collateralCustodyPubkey: string
  sizeUsd: Big
  collateralUsd: Big
  entryPrice: Big
  leverage: number
  unrealizedPnl: Big
  liquidationPrice: Big
}

export type CustodyInfo = {
  name: string
  pubkey: PublicKey
  mint: PublicKey
  tokenAccount: PublicKey
  dovesPriceAccount: PublicKey
  pythnetPriceAccount: PublicKey
  maxLeverage: number
  openFeeBps: number
  closeFeeBps: number
  borrowRate: Big
  utilizationRate: number
}

export type PoolStats = {
  aumUsd: Big
  name: string
}

export type IncreasePositionRequest = {
  owner: PublicKey
  market: keyof typeof CUSTODY     // SOL, ETH, BTC
  side: Side
  collateralToken: string          // SOL, ETH, BTC, USDC, USDT
  collateralAmount: BN             // in token's native decimals
  sizeUsdDelta: BN                 // position size in USD (6 decimals)
  priceSlippage: BN                // max price in USD (6 decimals)
  jupiterMinimumOut?: BN           // for cross-token swaps
}

export type DecreasePositionRequest = {
  owner: PublicKey
  positionPubkey: PublicKey
  desiredToken: string             // SOL, ETH, BTC, USDC, USDT
  sizeUsdDelta?: BN                // USD amount to decrease (6 decimals), ignored if entirePosition
  collateralUsdDelta?: BN          // collateral to withdraw (6 decimals)
  priceSlippage: BN                // max price in USD (6 decimals)
  jupiterMinimumOut?: BN
  entirePosition?: boolean
}

// ============================================================================
// Program instance
// ============================================================================

function createProgram(connection: Connection): Program {
  const provider = new AnchorProvider(
    connection,
    new Wallet(Keypair.generate()),
    AnchorProvider.defaultOptions()
  )
  return new Program(IDL as any, PROGRAM_ID, provider)
}

// ============================================================================
// PDA derivation
// ============================================================================

export function derivePositionPda(
  wallet: PublicKey,
  custody: PublicKey,
  collateralCustody: PublicKey,
  side: Side,
): PublicKey {
  return PublicKey.findProgramAddressSync(
    [
      Buffer.from("position"),
      wallet.toBuffer(),
      POOL.toBuffer(),
      custody.toBuffer(),
      collateralCustody.toBuffer(),
      Buffer.from(side === "long" ? [1] : [2]),
    ],
    PROGRAM_ID,
  )[0]
}

function derivePositionRequestPda(
  positionPubkey: PublicKey,
  requestChange: "increase" | "decrease",
): { positionRequest: PublicKey; counter: BN } {
  const counter = new BN(Math.floor(Math.random() * 1_000_000_000))
  const changeEnum = requestChange === "increase" ? [1] : [2]
  const [positionRequest] = PublicKey.findProgramAddressSync(
    [
      Buffer.from("position_request"),
      positionPubkey.toBuffer(),
      counter.toArrayLike(Buffer, "le", 8),
      Buffer.from(changeEnum),
    ],
    PROGRAM_ID,
  )
  return { positionRequest, counter }
}

// ============================================================================
// Custody resolution
// ============================================================================

/** Resolve market + side to custody and collateral custody */
export function resolveCustodies(market: string, side: Side) {
  const upper = market.toUpperCase()
  const custody = CUSTODY[upper as keyof typeof CUSTODY]
  if (!custody) throw new Error(`Unknown market: ${market}. Available: SOL, ETH, BTC`)

  // Longs: collateral = same asset custody
  // Shorts: collateral = USDC custody
  const collateralCustody = side === "long" ? custody : CUSTODY.USDC
  return { custody, collateralCustody }
}

/** Resolve token name to mint PublicKey */
function resolveInputMint(token: string): PublicKey {
  const mint = MARKET_MINTS[token.toUpperCase()]
  if (!mint) throw new Error(`Unknown token: ${token}. Available: SOL, ETH, BTC, USDC, USDT`)
  return mint
}

/** Fetch oracle accounts from custody on-chain data */
async function fetchCustodyOracles(
  program: Program,
  custodyPubkey: PublicKey,
): Promise<{ dovesPriceAccount: PublicKey; pythnetPriceAccount: PublicKey; tokenAccount: PublicKey; mint: PublicKey }> {
  const custody = await program.account.custody.fetch(custodyPubkey) as any
  return {
    dovesPriceAccount: custody.dovesOracle as PublicKey,
    pythnetPriceAccount: (custody.oracle as any).oracleAccount as PublicKey,
    tokenAccount: custody.tokenAccount as PublicKey,
    mint: custody.mint as PublicKey,
  }
}

// ============================================================================
// Transaction builders
// ============================================================================

/**
 * Build a createIncreasePositionMarketRequest transaction.
 * Opens a new position or increases an existing one.
 */
export async function buildIncreasePositionTx(
  connection: Connection,
  req: IncreasePositionRequest,
): Promise<VersionedTransaction> {
  const program = createProgram(connection)
  const { custody, collateralCustody } = resolveCustodies(req.market, req.side)
  const inputMint = resolveInputMint(req.collateralToken)

  const positionPubkey = derivePositionPda(req.owner, custody, collateralCustody, req.side)
  const { positionRequest, counter } = derivePositionRequestPda(positionPubkey, "increase")
  const positionRequestAta = getAssociatedTokenAddressSync(inputMint, positionRequest, true)
  const fundingAccount = getAssociatedTokenAddressSync(inputMint, req.owner)

  const preInstructions: TransactionInstruction[] = []
  const postInstructions: TransactionInstruction[] = []

  // Wrap SOL if needed
  if (inputMint.equals(NATIVE_MINT)) {
    preInstructions.push(
      createAssociatedTokenAccountIdempotentInstruction(req.owner, fundingAccount, req.owner, NATIVE_MINT),
      SystemProgram.transfer({
        fromPubkey: req.owner,
        toPubkey: fundingAccount,
        lamports: BigInt(req.collateralAmount.toString()),
      }),
      createSyncNativeInstruction(fundingAccount),
    )
    postInstructions.push(createCloseAccountInstruction(fundingAccount, req.owner, req.owner))
  }

  const increaseIx = await program.methods
    .createIncreasePositionMarketRequest({
      counter,
      collateralTokenDelta: req.collateralAmount,
      jupiterMinimumOut: req.jupiterMinimumOut ?? null,
      priceSlippage: req.priceSlippage,
      side: req.side === "long" ? { long: {} } : { short: {} },
      sizeUsdDelta: req.sizeUsdDelta,
    })
    .accounts({
      custody,
      collateralCustody,
      fundingAccount,
      inputMint,
      owner: req.owner,
      perpetuals: PERPETUALS_PDA,
      pool: POOL,
      position: positionPubkey,
      positionRequest,
      positionRequestAta,
      referral: null as any,
      tokenProgram: TOKEN_PROGRAM_ID,
      associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
      systemProgram: SystemProgram.programId,
      eventAuthority: EVENT_AUTHORITY,
      program: PROGRAM_ID,
    })
    .instruction()

  return buildAndSimulateTx(connection, req.owner, [...preInstructions, increaseIx, ...postInstructions])
}

/**
 * Build a createDecreasePositionMarketRequest transaction.
 * Decreases or closes an existing position.
 */
export async function buildDecreasePositionTx(
  connection: Connection,
  req: DecreasePositionRequest,
): Promise<VersionedTransaction> {
  const program = createProgram(connection)
  const desiredMint = resolveInputMint(req.desiredToken)

  // Fetch position data to get custody addresses and side
  const position = await program.account.position.fetch(req.positionPubkey) as any
  const owner = position.owner as PublicKey
  const isLong = !!position.side?.long

  // Auto-calculate priceSlippage if the caller passed a minimal placeholder
  // For closing a long: priceSlippage must be BELOW current price (min acceptable sell price)
  // For closing a short: priceSlippage must be ABOVE current price (max acceptable buy price)
  let priceSlippage = req.priceSlippage
  if (priceSlippage.lten(1_000_000)) {
    // Placeholder detected — use 10% buffer from a safe default
    // Long close: set to $0.01 (accept any price — keeper uses oracle)
    // Short close: set to $999,999 (accept any price)
    priceSlippage = isLong ? new BN(10_000) : new BN(999_999_000_000)
  }

  const { positionRequest, counter } = derivePositionRequestPda(req.positionPubkey, "decrease")
  const positionRequestAta = getAssociatedTokenAddressSync(desiredMint, positionRequest, true)
  const receivingAccount = getAssociatedTokenAddressSync(desiredMint, owner, true)

  const preInstructions: TransactionInstruction[] = []
  const postInstructions: TransactionInstruction[] = []

  // Close wSOL ATA after receiving
  if (desiredMint.equals(NATIVE_MINT)) {
    postInstructions.push(createCloseAccountInstruction(receivingAccount, owner, owner))
  }

  const decreaseIx = await program.methods
    .createDecreasePositionMarketRequest({
      collateralUsdDelta: req.collateralUsdDelta ?? new BN(0),
      sizeUsdDelta: req.sizeUsdDelta ?? new BN(0),
      priceSlippage,
      jupiterMinimumOut: req.jupiterMinimumOut ?? null,
      counter,
      entirePosition: req.entirePosition ?? null,
    })
    .accounts({
      owner,
      receivingAccount,
      perpetuals: PERPETUALS_PDA,
      pool: POOL,
      position: req.positionPubkey,
      positionRequest,
      positionRequestAta,
      custody: position.custody,
      collateralCustody: position.collateralCustody,
      desiredMint,
      referral: null as any,
      tokenProgram: TOKEN_PROGRAM_ID,
      associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
      systemProgram: SystemProgram.programId,
      eventAuthority: EVENT_AUTHORITY,
      program: PROGRAM_ID,
    })
    .instruction()

  return buildAndSimulateTx(connection, owner, [...preInstructions, decreaseIx, ...postInstructions])
}

// ============================================================================
// Transaction assembly + simulation
// ============================================================================

async function buildAndSimulateTx(
  connection: Connection,
  payer: PublicKey,
  instructions: TransactionInstruction[],
): Promise<VersionedTransaction> {
  // Prepend priority fee
  const allIx = [
    ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 100_000 }),
    ...instructions,
  ]

  // Simulate to get compute units
  const { blockhash: simBlockhash } = await connection.getLatestBlockhash("confirmed")
  const simTx = new VersionedTransaction(
    new TransactionMessage({
      instructions: allIx,
      payerKey: payer,
      recentBlockhash: simBlockhash,
    }).compileToV0Message([]),
  )

  const simulation = await connection.simulateTransaction(simTx, {
    replaceRecentBlockhash: true,
    sigVerify: false,
  })

  if (simulation.value.err) {
    const logs = simulation.value.logs?.join("\n") ?? "no logs"
    throw new Error(`Transaction simulation failed: ${JSON.stringify(simulation.value.err)}\n${logs}`)
  }

  // Prepend compute unit limit from simulation
  const cuLimit = Math.min((simulation.value.unitsConsumed || 200_000) * 1.2, 1_400_000)
  allIx.unshift(ComputeBudgetProgram.setComputeUnitLimit({ units: Math.ceil(cuLimit) }))

  const { blockhash } = await connection.getLatestBlockhash("confirmed")

  const txMessage = new TransactionMessage({
    payerKey: payer,
    recentBlockhash: blockhash,
    instructions: allIx,
  }).compileToV0Message()

  return new VersionedTransaction(txMessage)
}

// ============================================================================
// Read-only queries (existing)
// ============================================================================

function bnToBig(bn: BN, decimals = USDC_DECIMALS): Big {
  return Big(bn.toString()).div(Big(10).pow(decimals))
}

export async function getPoolStats(connection: Connection): Promise<PoolStats> {
  const program = createProgram(connection)
  const pool = await program.account.pool.fetch(POOL)
  return {
    aumUsd: bnToBig(pool.aumUsd as BN),
    name: Buffer.from(pool.name as number[]).toString("utf8").replace(/\0/g, ""),
  }
}

async function getCustodyInfo(
  connection: Connection,
  market: keyof typeof CUSTODY,
): Promise<CustodyInfo> {
  const program = createProgram(connection)
  const custodyData = await program.account.custody.fetch(CUSTODY[market]) as any
  return {
    name: market,
    pubkey: CUSTODY[market],
    mint: custodyData.mint,
    tokenAccount: custodyData.tokenAccount,
    dovesPriceAccount: custodyData.dovesOracle,
    pythnetPriceAccount: (custodyData.oracle as any).oracleAccount,
    maxLeverage: (custodyData.pricing as any).maxLeverage.toNumber() / 10000,
    openFeeBps: custodyData.increasePositionBps.toNumber(),
    closeFeeBps: custodyData.decreasePositionBps.toNumber(),
    borrowRate: Big(0),
    utilizationRate: 0,
  }
}

export async function getAllCustodyInfo(connection: Connection): Promise<CustodyInfo[]> {
  const markets: (keyof typeof CUSTODY)[] = ["SOL", "ETH", "BTC"]
  return Promise.all(markets.map((m) => getCustodyInfo(connection, m)))
}

export async function getOpenPositions(
  connection: Connection,
  walletPubkey: PublicKey | string,
): Promise<PerpsPosition[]> {
  const wallet = typeof walletPubkey === "string" ? new PublicKey(walletPubkey) : walletPubkey
  const program = createProgram(connection)

  const gpaResult = await connection.getProgramAccounts(program.programId, {
    commitment: "confirmed",
    filters: [
      { memcmp: { bytes: wallet.toBase58(), offset: 8 } },
      { memcmp: program.coder.accounts.memcmp("Position") },
    ],
  })

  const positions: PerpsPosition[] = gpaResult.map((item) => {
    const account = program.coder.accounts.decode("Position", item.account.data) as any
    const custodyKey = account.custody.toBase58()
    const sizeUsd = bnToBig(account.sizeUsd)
    const collateralUsd = bnToBig(account.collateralUsd)

    return {
      publicKey: item.pubkey.toBase58(),
      owner: account.owner.toBase58(),
      side: (account.side.long ? "long" : "short") as Side,
      custody: CUSTODY_NAMES[custodyKey] || custodyKey,
      custodyPubkey: custodyKey,
      collateralCustodyPubkey: (account.collateralCustody as PublicKey).toBase58(),
      sizeUsd,
      collateralUsd,
      entryPrice: bnToBig(account.price),
      leverage: sizeUsd.div(collateralUsd.eq(0) ? Big(1) : collateralUsd).toNumber(),
      unrealizedPnl: Big(0),
      liquidationPrice: Big(0),
    }
  })

  return positions.filter((p) => p.sizeUsd.gt(0))
}

// Re-export constants for use by commands
export { CUSTODY, POOL, PROGRAM_ID, MARKET_MINTS }
