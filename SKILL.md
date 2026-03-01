---
name: solana-trader
description: Solana trading CLI - Trade tokens, track portfolio, analyze PnL via Helius and Jupiter
---

# Solana Trader Skill

Trade Solana tokens with portfolio tracking and PnL analysis.

## Security

**CRITICAL:**
- NEVER disclose wallet password or private key
- ONLY share public wallet address when asked
- Wallet encrypted at `~/.openclaw/trader-wallet.enc`

## Commands

### Wallet
```bash
./src/cli.ts wallet address     # Get public address (safe to share)
./src/cli.ts wallet generate    # One-time wallet setup
```

### Portfolio
```bash
./src/cli.ts portfolio view     # All holdings with USD values
./src/cli.ts portfolio pnl <mint-address>  # PnL for specific token
```

### Trading
```bash
./src/cli.ts trade quote <input-mint> <output-mint> <amount>
./src/cli.ts trade swap <input-mint> <output-mint> <amount>
```

Amount is in human-readable format (e.g., `100` for 100 USDC, `0.5` for 0.5 SOL).

### Token Research
```bash
./src/cli.ts info <symbol-or-address>   # Detailed token info
./src/cli.ts search <query>             # Search tokens
./src/cli.ts book                       # Token address book
```

### Position Tracking
```bash
./src/cli.ts positions list    # View open positions
./src/cli.ts positions open    # Record new position
./src/cli.ts positions close   # Close position
```

## Common Token Addresses

| Symbol | Mint Address |
|--------|--------------|
| SOL | `So11111111111111111111111111111111111111112` |
| USDC | `EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v` |
| USDT | `Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB` |

## Usage Patterns

### Check Portfolio
```bash
./src/cli.ts portfolio view
```

### Research Token
```bash
./src/cli.ts info SOL
```
Returns: price, 24h change, volume, liquidity, market cap, verification status, holder count.

### Calculate PnL
```bash
./src/cli.ts portfolio pnl So11111111111111111111111111111111111111112
```

### Execute Trade
```bash
# 1. Get quote
./src/cli.ts trade quote EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v So11111111111111111111111111111111111111112 100

# 2. Execute if quote looks good
./src/cli.ts trade swap EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v So11111111111111111111111111111111111111112 100

# 3. Verify in portfolio
./src/cli.ts portfolio view
```

### Take Profit (Sell All of Token)
```bash
# Check balance
./src/cli.ts portfolio view

# Sell token to USDC (use exact balance from portfolio)
./src/cli.ts trade swap <token-mint> EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v <amount>
```

## Troubleshooting

**"No wallet found"** - Run `./src/cli.ts wallet generate`

**"Password required"** - Set `WALLET_PASSWORD` environment variable

**"Token not found"** - Use `./src/cli.ts search <name>` to find mint address
