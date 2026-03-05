# @zeroexcore/trader

Solana trading CLI — tokens, prediction markets, perpetuals, NFTs.

## Install

```bash
npm install -g @zeroexcore/trader
trader diagnose
```

Or run without installing:
```bash
npx @zeroexcore/trader diagnose
```

For development:
```bash
git clone https://github.com/zeroexcore/trader
cd trader
npm install
npm run dev -- <command>
```

### Environment

```bash
HELIUS_API_KEY=xxx          # required - RPC + DAS API (free at dev.helius.xyz)
WALLET_PASSWORD=xxx         # required - wallet encryption password
JUPITER_API_KEY=xxx         # for swaps + predictions (free at portal.jup.ag)
USE_HELIUS_SENDER=true      # optional - low-latency tx submission
RPC_URL=xxx                 # optional - override RPC endpoint
```

```bash
trader wallet generate      # one-time wallet creation
trader diagnose             # verify everything works
```

## Commands

```
trader
├── wallet                          # wallet management
│   ├── address                     # public address (safe to share)
│   ├── generate                    # create encrypted wallet (one time)
│   └── export                      # export private key for backup
│
├── tokens                          # token registry, market data, swaps
│   ├── list                        # saved token addresses
│   ├── add <TICKER> <addr>         # save a token
│   ├── remove <TICKER>             # remove a token
│   ├── browse                      # discover trending tokens [verified]
│   ├── search <query>              # search by name/symbol [verified]
│   ├── info <token>                # detailed market data
│   ├── quote <in> <out> <amt>      # get swap quote
│   ├── swap <in> <out> <amt>       # execute swap (--note, --force)
│   └── positions                   # on-chain token holdings
│
├── portfolio                       # aggregate view: tokens + predictions + PnL
│
├── predict                         # prediction markets (Jupiter)
│   ├── browse                      # discover popular markets (-c category)
│   ├── search <query>              # search events
│   ├── show <market-id>            # odds + details
│   ├── buy <id> <side> <amt>       # buy contracts (--note)
│   ├── sell <id> <side> <n>        # sell contracts (--note)
│   ├── close <id>                  # close entire position (--note)
│   ├── claim <id>                  # claim winnings (--note)
│   └── positions                   # my prediction bets + PnL
│
├── perps                           # perpetual futures (Jupiter)
│   ├── show [market]               # market info + fees
│   ├── positions                   # open perp positions
│   └── pool                        # JLP pool AUM
│
├── nfts                            # NFT market data (Magic Eden)
│   ├── floor <collection>          # floor price
│   ├── listings <collection>       # browse listings
│   ├── popular                     # trending collections
│   ├── search <query>              # search collections
│   └── positions                   # my NFT holdings
│
└── diagnose                        # check env, connectivity, wallet, balance
```

### Output

JSON by default (for agent consumption). Use `--md` for human-readable markdown.

```bash
trader --md portfolio               # human-readable
trader portfolio                    # JSON (default)
```

### Safety

- **SOL gas reserve:** `tokens swap` blocks selling SOL below 0.05 SOL reserve. Use `--force` to override.
- **Trade journaling:** All mutation commands accept `--note "reason"` for automatic position tracking.
- Positions auto-tracked in `~/.openclaw/trader-positions.json`

### Token Shortcuts

Built-in: `SOL`, `USDC`, `USDT`, `WBTC`, `WETH`, `JUP`, `JupUSD`, `GLDx`, `RAY`

Add more: `trader tokens add BONK DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263`

### Prediction Markets

Requires `JUPITER_API_KEY`. Geo-blocked in US/South Korea.

**Pricing:** $0.85 = 85% implied probability. Win $1/contract if correct.

```bash
trader predict search "NBA"             # find events
trader predict show POLY-566140         # check odds
trader predict buy POLY-566140 yes 2    # bet $2
trader predict positions                # monitor bets
trader predict claim POLY-566140        # collect winnings
```

## Security

All sensitive data in `~/.openclaw/` with restrictive permissions:
- `trader-wallet.enc` — encrypted wallet (AES-256-GCM, `0600`)
- `trader-positions.json` — trade journal (`0600`)
- `trader-tokens.json` — token registry (`0600`)

Never share your password or private key. Public address is safe to share.

## Agent Integration

This CLI is designed for use by [OpenClaw](https://openclaw.ai) agents.

- `SKILL.md` — OpenCode skill definition
- `openclaw-skill.md` — ClawHub skill definition
