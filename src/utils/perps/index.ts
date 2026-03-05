import { AnchorProvider, Program, Wallet, BN } from "@coral-xyz/anchor"
import { Connection, Keypair, PublicKey } from "@solana/web3.js"
import Big from "big.js"
import { createRequire } from "module"

// Load IDL using createRequire for Node.js compatibility
const require = createRequire(import.meta.url)
const IDL = require("./idl.json")

// Program IDs
export const JUPITER_PERPETUALS_PROGRAM_ID = new PublicKey(
  "PERPHjGBqRHArX4DySjwM6UJHiR3sWAatqfdBS2qQJu"
)

export const JLP_POOL_ACCOUNT_PUBKEY = new PublicKey(
  "5BUwFW4nRbftYTDMbgxykoFWqWHPzahFSNAaaaJtVKsq"
)

// Custody accounts
export const CUSTODY = {
  SOL: new PublicKey("7xS2gz2bTp3fwCC7knJvUWTEU9Tycczu6VhJYKgi1wdz"),
  ETH: new PublicKey("AQCGyheWPLeo6Qp9WpYS9m3Qj479t7R636N9ey1rEjEn"),
  BTC: new PublicKey("5Pv3gM9JrFFH883SWAhvJC9RPYmo8UNxuFtv5bMMALkm"),
  USDC: new PublicKey("G18jKKXQwBbrHeiK3C9MRXhkHsLHf7XgCSisykV46EZa"),
  USDT: new PublicKey("4vkNeXiYEUizLdrpdPS1eC2mccyM4NUPRtERrk6ZETkk"),
} as const

const CUSTODY_NAMES = Object.fromEntries(
  Object.entries(CUSTODY).map(([k, v]) => [v.toBase58(), k])
)

const USDC_DECIMALS = 6

// Types
export type PerpsPosition = {
  publicKey: string
  owner: string
  side: "long" | "short"
  custody: string
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

// Create program instance
function createProgram(connection: Connection): Program {
  const provider = new AnchorProvider(
    connection,
    new Wallet(Keypair.generate()),
    AnchorProvider.defaultOptions()
  )
  return new Program(IDL as any, JUPITER_PERPETUALS_PROGRAM_ID, provider)
}

// Helper to convert BN to Big
function bnToBig(bn: BN, decimals = USDC_DECIMALS): Big {
  return Big(bn.toString()).div(Big(10).pow(decimals))
}

// Fetch JLP pool stats
export async function getPoolStats(connection: Connection): Promise<PoolStats> {
  const program = createProgram(connection)
  const pool = await program.account.pool.fetch(JLP_POOL_ACCOUNT_PUBKEY)

  return {
    aumUsd: bnToBig(pool.aumUsd),
    name: Buffer.from(pool.name as number[]).toString("utf8").replace(/\0/g, ""),
  }
}

// Fetch custody info for a market
export async function getCustodyInfo(
  connection: Connection,
  market: keyof typeof CUSTODY
): Promise<CustodyInfo> {
  const program = createProgram(connection)
  const custody = await program.account.custody.fetch(CUSTODY[market])

  return {
    name: market,
    pubkey: CUSTODY[market],
    maxLeverage: (custody.pricing as any).maxLeverage.toNumber() / 10000,
    openFeeBps: (custody as any).increasePositionBps.toNumber(),
    closeFeeBps: (custody as any).decreasePositionBps.toNumber(),
    borrowRate: Big(0),
    utilizationRate: 0,
  }
}

// Fetch all custody info
export async function getAllCustodyInfo(connection: Connection): Promise<CustodyInfo[]> {
  const markets: (keyof typeof CUSTODY)[] = ["SOL", "ETH", "BTC"]
  return Promise.all(markets.map((m) => getCustodyInfo(connection, m)))
}

// Fetch open positions for a wallet
export async function getOpenPositions(
  connection: Connection,
  walletPubkey: PublicKey | string
): Promise<PerpsPosition[]> {
  const wallet = typeof walletPubkey === "string" ? new PublicKey(walletPubkey) : walletPubkey
  const program = createProgram(connection)

  const gpaResult = await connection.getProgramAccounts(program.programId, {
    commitment: "confirmed",
    filters: [
      { memcmp: { bytes: wallet.toBase58(), offset: 8 } },
      { memcmp: program.coder.accounts.memcmp("position") },
    ],
  })

  const positions: PerpsPosition[] = gpaResult.map((item) => {
    const account = program.coder.accounts.decode("position", item.account.data) as any
    const custodyKey = account.custody.toBase58()
    const sizeUsd = bnToBig(account.sizeUsd)
    const collateralUsd = bnToBig(account.collateralUsd)

    return {
      publicKey: item.pubkey.toBase58(),
      owner: account.owner.toBase58(),
      side: (account.side.long ? "long" : "short") as "long" | "short",
      custody: CUSTODY_NAMES[custodyKey] || custodyKey,
      sizeUsd,
      collateralUsd,
      entryPrice: bnToBig(account.price),
      leverage: sizeUsd.div(collateralUsd.eq(0) ? Big(1) : collateralUsd).toNumber(),
      unrealizedPnl: Big(0),
      liquidationPrice: Big(0),
    }
  })

  // Filter for open positions (sizeUsd > 0)
  return positions.filter((p) => p.sizeUsd.gt(0))
}

// Calculate PnL for a position
export function calculatePnl(
  position: PerpsPosition,
  currentPrice: Big
): { pnl: Big; pnlPercent: number } {
  const priceDelta = currentPrice.minus(position.entryPrice).abs()
  const rawPnl = position.sizeUsd.times(priceDelta).div(position.entryPrice)

  const isProfit =
    position.side === "long"
      ? currentPrice.gt(position.entryPrice)
      : currentPrice.lt(position.entryPrice)

  const pnl = isProfit ? rawPnl : rawPnl.neg()
  const pnlPercent = pnl.div(position.collateralUsd).times(100).toNumber()

  return { pnl, pnlPercent }
}
