---
name: openclaw-trader
description: Solana trading CLI - Trade tokens, track portfolio, analyze PnL via Helius and Jupiter
---

# openclaw-trader

Trade Solana tokens with portfolio tracking and PnL analysis.

## Security

**CRITICAL:**
- NEVER disclose wallet password or private key
- ONLY share public wallet address when asked
- Wallet encrypted at `~/.openclaw/trader-wallet.enc`

## Commands

### Wallet
```bash
openclaw-trader wallet address     # Get public address (safe to share)
openclaw-trader wallet generate    # One-time wallet setup
```

### Portfolio
```bash
openclaw-trader portfolio view     # All holdings with USD values
openclaw-trader portfolio pnl <mint-address>  # PnL for specific token
```

### Trading
```bash
openclaw-trader trade quote <input-mint> <output-mint> <amount>
openclaw-trader trade swap <input-mint> <output-mint> <amount>
```

Amount is in human-readable format (e.g., `100` for 100 USDC, `0.5` for 0.5 SOL).

### Token Research
```bash
openclaw-trader info <symbol-or-address>   # Detailed token info
openclaw-trader search <query>             # Search tokens
openclaw-trader book                       # Token address book
```

### Position Tracking
```bash
openclaw-trader positions list    # View open positions
openclaw-trader positions open    # Record new position
openclaw-trader positions close   # Close position
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
openclaw-trader trade quote EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v So11111111111111111111111111111111111111112 100

# 2. Execute if quote looks good
openclaw-trader trade swap EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v So11111111111111111111111111111111111111112 100

# 3. Verify in portfolio
openclaw-trader portfolio view
```

### Take Profit (Sell All of Token)
```bash
# Check balance
openclaw-trader portfolio view

# Sell token to USDC (use exact balance from portfolio)
openclaw-trader trade swap <token-mint> EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v <amount>
```

## Troubleshooting

**"No wallet found"** - Run `openclaw-trader wallet generate`

**"Password required"** - Set `WALLET_PASSWORD` environment variable

**"Token not found"** - Use `openclaw-trader search <name>` to find mint address
