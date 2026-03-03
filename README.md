# openclaw-trader

Solana trading CLI - trade tokens with portfolio tracking and PnL analysis.

## Install

```bash
# npm
npm install -g github:zeroexcore/trader

# pnpm
pnpm add -g github:zeroexcore/trader
```

## Setup

```bash
export HELIUS_API_KEY=your_key      # Get from helius.dev
export WALLET_PASSWORD=your_password

# Generate wallet (one-time)
openclaw-trader wallet generate
```

## Commands

### Wallet
```bash
openclaw-trader wallet generate    # Create encrypted wallet
openclaw-trader wallet address     # Show public address
```

### Portfolio
```bash
openclaw-trader portfolio view                  # All holdings with USD values
openclaw-trader portfolio pnl <mint-address>    # PnL for specific token
```

### Trading
```bash
openclaw-trader trade quote <input-mint> <output-mint> <amount>
openclaw-trader trade swap <input-mint> <output-mint> <amount>
```

Example - Sell 100 USDC for SOL:
```bash
openclaw-trader trade swap EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v So11111111111111111111111111111111111111112 100
```

### Token Info
```bash
openclaw-trader info SOL           # Detailed token info
openclaw-trader search nvidia      # Search tokens by name
openclaw-trader book               # Token address book
```

### Position Tracking
```bash
openclaw-trader positions list     # View open positions
openclaw-trader positions open     # Record new position
openclaw-trader positions close    # Close position
```

### Prediction Markets (Jupiter)
```bash
openclaw-trader predict list                          # Browse events
openclaw-trader predict search "texas primary"        # Search events
openclaw-trader predict market POLY-562186            # Market details + pricing
openclaw-trader predict buy POLY-562186 yes 5         # Buy $5 of YES contracts
openclaw-trader predict positions                     # View your bets
openclaw-trader predict sell POLY-562186 yes 5        # Sell contracts
openclaw-trader predict claim <position-pubkey>       # Claim winnings
```

Requires `JUPITER_API_KEY` from [portal.jup.ag](https://portal.jup.ag). Note: API is geo-restricted (US/South Korea blocked).

## Common Tokens

| Symbol | Mint Address |
|--------|--------------|
| SOL | `So11111111111111111111111111111111111111112` |
| USDC | `EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v` |
| USDT | `Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB` |

## Tech Stack

- **Helius** - Portfolio data, token metadata, transaction submission
- **Jupiter** - DEX aggregation for best-price swaps + Prediction Markets
- **Solana Web3.js** - Blockchain interactions
- **big.js** - Precision math for financial calculations

## Security

- Wallet encrypted with AES-256-GCM at `~/.openclaw/trader-wallet.enc`
- Never commit `.env` or wallet files
- Only share public wallet address

## Environment Variables

```bash
HELIUS_API_KEY=xxx          # Required - from helius.dev
WALLET_PASSWORD=xxx         # Required - encrypts wallet
RPC_URL=xxx                 # Optional - defaults to Helius
USE_HELIUS_SENDER=true      # Optional - ultra-low latency tx submission
JUPITER_API_KEY=xxx         # Optional - for prediction markets (portal.jup.ag)
```

## Agent Integration

See `SKILL.md` for AI agent usage patterns and workflows.

## License

ISC
