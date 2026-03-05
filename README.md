# @zeroexcore/trader

Solana trading CLI with portfolio tracking, prediction markets, and NFT browsing.

## Installation

```bash
npm install -g @zeroexcore/trader
```

Or for development:
```bash
git clone https://github.com/zeroexcore/trader
cd trader
pnpm install
pnpm dev <command>
```

## API Keys (Free)

| Key | Required | Get it at |
|-----|----------|-----------|
| `HELIUS_API_KEY` | Yes | https://dev.helius.xyz - Free tier: 100k credits/month |
| `WALLET_PASSWORD` | Yes | Your chosen password to encrypt the wallet |
| `JUPITER_API_KEY` | For predictions | https://station.jup.ag/docs - Free, request access |

**Note:** `HELIUS_API_KEY` provides both the DAS API (portfolio/token data) and RPC endpoint. No separate `RPC_URL` needed.

## Setup

```bash
export HELIUS_API_KEY=xxx       # from helius.dev
export WALLET_PASSWORD=xxx      # your chosen password
export JUPITER_API_KEY=xxx      # from station.jup.ag (optional)

trader wallet generate          # one-time wallet creation
```

## Commands

### Portfolio
```bash
trader portfolio view              # holdings with USD values
trader portfolio view -c           # with sparkline charts
trader portfolio charts            # multi-asset price chart (brand colors)
trader portfolio chart SOL         # single token chart
trader portfolio watch             # live price monitoring
trader portfolio pnl <token>       # detailed PnL analysis
```

### Trading
```bash
trader trade quote SOL USDC 1      # get swap quote
trader trade swap SOL USDC 1       # execute swap
```

### Positions
```bash
trader positions list              # open positions
trader positions list --all        # include closed
trader positions stats             # performance statistics
trader positions open long SOL 1 90   # record position
trader positions open long SOL 1 90 -n "Swing trade" --tags "swing"  # with notes/tags
trader positions close <id> 95 1   # close with exit price
trader positions close <id> 95 1 -n "Hit target"  # with exit notes
trader positions update            # refresh current prices
trader positions note <id> "note"  # add notes
trader positions tag <id> "tags"   # add tags
trader positions filter "tag"      # filter by tag
trader positions show <id>         # show single position
```

### Prediction Markets

Requires `JUPITER_API_KEY`. Geo-blocked in US/South Korea.

```bash
trader predict list                # browse events
trader predict list -c sports      # filter by category
trader predict search "arsenal"    # search events
trader predict market POLY-123     # market details + odds
trader predict buy POLY-123 yes 10 # bet $10 on YES
trader predict sell POLY-123 yes 5 # sell 5 contracts
trader predict close POLY-123      # close entire position
trader predict positions           # view bets with PnL
trader predict watch -c            # live odds monitoring + ASCII chart
trader predict claim POLY-123      # claim winnings
```

**Pricing:** $0.85 = 85% implied probability. Win $1 per contract if correct.

### NFTs
```bash
trader nft floor mad_lads          # collection floor price
trader nft listings mad_lads       # browse listings
trader nft popular                 # trending collections
trader nft search "okay bears"     # search collections
trader nft portfolio               # your NFTs
```

### Perpetuals (Jupiter)
```bash
trader perps pool                  # JLP pool stats
trader perps markets               # available markets + fees
trader perps positions             # your open perps positions
trader perps info                  # how perps work
```

### Collector Crypt (Pokemon TCG)
```bash
trader crypt stock                 # check gacha machine stock
trader crypt epic                  # browse epic cards
trader crypt rare                  # browse rare cards
trader crypt browse                # marketplace listings
```

### Token Info
```bash
trader info SOL                    # token details
trader search nvidia               # search tokens
trader book list                   # saved addresses
trader book add MYTOKEN <mint>     # save address
trader book remove MYTOKEN         # remove address
```

## Token Shortcuts

Use tickers instead of addresses: `SOL`, `USDC`, `WBTC`, `GLDx`, `JupUSD`, `JUP`

## Security

All sensitive data stored in `~/.openclaw/` (OpenClaw trusted boundary):
- `trader-wallet.enc` - Encrypted wallet (AES-256-GCM)
- `trader-positions.json` - Position history

File permissions: `0600` (files), `0700` (directory)

- Never share password or private key
- Public address is safe to share

## OpenClaw Integration

This CLI is designed to work with [OpenClaw](https://openclaw.ai) as an agent skill.

See `openclaw-skill.md` for the ClawHub-ready skill definition, or `SKILL.md` for local OpenCode use.

Configure secrets via OpenClaw config (recommended):
```json5
// ~/.openclaw/openclaw.json
{
  "skills": {
    "entries": {
      "zeroexcore-trader": {
        "apiKey": "your_wallet_password",
        "env": {
          "HELIUS_API_KEY": "your_helius_key",
          "JUPITER_API_KEY": "your_jupiter_key"
        }
      }
    }
  }
}
```
