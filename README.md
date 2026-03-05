# openclaw-trader

Solana trading CLI with portfolio tracking, prediction markets, and NFT browsing.

## Setup

```bash
pnpm add -g github:zeroexcore/trader

export HELIUS_API_KEY=xxx       # helius.dev
export WALLET_PASSWORD=xxx      # encrypts wallet
export JUPITER_API_KEY=xxx      # portal.jup.ag (for predictions)

openclaw-trader wallet generate  # one-time
```

## Commands

### Portfolio
```bash
portfolio view              # holdings with USD values
portfolio view -c           # with sparkline charts
portfolio charts            # multi-asset price chart (brand colors)
portfolio chart SOL         # single token chart
portfolio watch             # live price monitoring
portfolio pnl <token>       # detailed PnL analysis
```

### Trading
```bash
trade quote SOL USDC 1      # get swap quote
trade swap SOL USDC 1       # execute swap
```

### Positions
```bash
positions list              # open positions
positions list --all        # include closed
positions open long SOL 1 90   # record position
positions close <id> 95 1   # close with exit price
positions update            # refresh current prices
```

### Prediction Markets
```bash
predict list                # browse events
predict list -c sports      # filter by category
predict search "arsenal"    # search events
predict market POLY-123     # market details + odds
predict buy POLY-123 yes 10 # bet $10 on YES
predict sell POLY-123 yes 5 # sell 5 contracts
predict close POLY-123      # close entire position (dump it)
predict positions           # view bets with PnL
predict watch -c            # live odds monitoring + ASCII chart
predict claim POLY-123      # claim winnings (accepts market ID or pubkey)
```

### NFTs
```bash
nft floor mad_lads          # collection floor price
nft listings mad_lads       # browse listings
nft popular                 # trending collections
nft search "okay bears"     # search collections
nft portfolio               # your NFTs
```

### Collector Crypt (Pokemon TCG)
```bash
cards stock <set> <number>  # check card stock
cards epic                  # browse epic cards
cards rare                  # browse rare cards
```

### Token Info
```bash
info SOL                    # token details
search nvidia               # search tokens
book                        # saved addresses
book add MYTOKEN <mint>     # save address
```

## Token Shortcuts

Use tickers instead of addresses: `SOL`, `USDC`, `WBTC`, `GLDx`, `JupUSD`

## Environment

```bash
HELIUS_API_KEY=xxx          # required
WALLET_PASSWORD=xxx         # required
RPC_URL=xxx                 # optional (defaults to Helius)
JUPITER_API_KEY=xxx         # for prediction markets
```

## Security

- Wallet encrypted with AES-256-GCM at `~/.openclaw/trader-wallet.enc`
- Never share password or private key
- Public address is safe to share
