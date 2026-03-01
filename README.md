# Solana Trader CLI

Trading CLI for Solana - trade tokenized stocks (RWA), gold, and crypto with portfolio tracking and PnL analysis.

## Quick Start

```bash
npm install
export HELIUS_API_KEY=your_key
export WALLET_PASSWORD=your_password

# Generate wallet (one-time)
./src/cli.ts wallet generate

# Get address
./src/cli.ts wallet address
```

## Commands

### Wallet
```bash
./src/cli.ts wallet generate    # Create encrypted wallet
./src/cli.ts wallet address     # Show public address
```

### Portfolio
```bash
./src/cli.ts portfolio view                  # All holdings with USD values
./src/cli.ts portfolio pnl <mint-address>    # PnL for specific token
```

### Trading
```bash
./src/cli.ts trade quote <input-mint> <output-mint> <amount>
./src/cli.ts trade swap <input-mint> <output-mint> <amount>
```

Example - Sell 100 USDC for SOL:
```bash
./src/cli.ts trade swap EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v So11111111111111111111111111111111111111112 100
```

### Token Info
```bash
./src/cli.ts info SOL           # Detailed token info
./src/cli.ts search nvidia      # Search tokens by name
./src/cli.ts book               # Token address book
```

### Position Tracking
```bash
./src/cli.ts positions list     # View open positions
./src/cli.ts positions open     # Record new position
./src/cli.ts positions close    # Close position
```

## Common Tokens

| Symbol | Mint Address |
|--------|--------------|
| SOL | `So11111111111111111111111111111111111111112` |
| USDC | `EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v` |
| USDT | `Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB` |

## Tech Stack

- **Helius** - Portfolio data, token metadata, transaction submission
- **Jupiter** - DEX aggregation for best-price swaps
- **Solana Web3.js** - Blockchain interactions

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
```

## Agent Integration

See `SKILL.md` for AI agent usage patterns and workflows.

## License

ISC
