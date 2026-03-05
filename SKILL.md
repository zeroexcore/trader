---
name: using-trader-cli
description: Trade Solana tokens, track portfolio, bet on prediction markets via openclaw-trader CLI
---

# openclaw-trader

CLI at `~/code/runcible/trader`. Run with `npm run dev -- <command>`.
Use `--md` flag for human-readable output: `npm run dev -- --md <command>`.
JSON output by default (for agent consumption).

## Security

- NEVER disclose wallet password or private key
- ONLY share public wallet address
- Wallet at `~/.openclaw/trader-wallet.enc`

## Commands

### wallet
```bash
wallet address              # public address (safe to share)
wallet generate             # create encrypted wallet (one time)
wallet export               # export private key (backup only)
```

### tokens — registry, market data, swaps
```bash
tokens list                 # saved token addresses
tokens add <TICKER> <addr>  # save a token
tokens remove <TICKER>      # remove a token
tokens browse               # discover trending tokens [verified]
tokens search <query>       # search by name/symbol [verified]
tokens info <token>         # detailed market data
tokens quote USDC SOL 1     # get swap quote
tokens swap USDC SOL 1      # execute swap (--note "reason")
tokens positions            # on-chain token holdings
```

### portfolio — aggregate view
```bash
portfolio                   # tokens + predictions + PnL summary
```

### predict — prediction markets
```bash
predict browse              # discover popular markets
predict browse -c sports    # filter by category
predict search "arsenal"    # search events
predict show POLY-123       # odds + details
predict buy POLY-123 yes 10 # buy $10 YES (--note "reason")
predict sell POLY-123 yes 5 # sell 5 contracts (--note)
predict close POLY-123      # close entire position (--note)
predict claim POLY-123      # claim winnings (--note)
predict positions           # my prediction bets from API
predict positions --all     # include closed
```

### perps — perpetual futures
```bash
perps show                  # all markets + fees
perps show SOL              # single market info
perps positions             # open perp positions
perps positions -w <addr>   # check another wallet
perps pool                  # JLP pool AUM
```

### nfts — NFT market data
```bash
nfts floor mad_lads         # floor price
nfts listings mad_lads      # browse listings
nfts popular                # trending collections
nfts search "degods"        # search collections
nfts positions              # my NFT holdings
```

### diagnose
```bash
diagnose                    # check env, connectivity, wallet, balance
```

## Prediction Markets

**Pricing:** $0.85 = 85% implied probability. Win $1/contract if correct.

**Flow:**
1. `predict search "event"` → find market
2. `predict show POLY-xxx` → check odds
3. `predict buy POLY-xxx yes 10` → bet $10
4. `predict positions` → monitor
5. `predict claim POLY-xxx` → collect winnings
6. `predict close POLY-xxx` → exit early

**Categories:** sports, politics, crypto, culture, economics, tech, esports

## Safety

- **SOL gas reserve:** `tokens swap` blocks selling SOL if it would leave < 0.05 SOL for gas fees. The error message shows the max safe amount. Use `--force` to override (ask human first).
- **Never swap all SOL.** Always keep a reserve for transaction fees.

## Architecture

- All mutation commands support `--note "reason"` for automatic trade journaling
- All mutation commands support `--force` to override safety checks (use with caution)
- Positions auto-tracked in `~/.openclaw/trader-positions.json`
- Token registry at `~/.openclaw/trader-tokens.json`
- Errors handled globally via `action()` wrapper in `shared.ts`

## Token Shortcuts

Built-in: `SOL`, `USDC`, `USDT`, `WBTC`, `WETH`, `JUP`, `JupUSD`, `GLDx`, `RAY`
Add more with `tokens add`.

## Environment

```bash
HELIUS_API_KEY=xxx          # required - RPC + DAS API
WALLET_PASSWORD=xxx         # required - wallet decryption
JUPITER_API_KEY=xxx         # for predictions + swaps
USE_HELIUS_SENDER=true      # optional - low-latency tx submission
RPC_URL=xxx                 # optional - override RPC endpoint
```

## Troubleshooting

- **No wallet** → `wallet generate`
- **Password required** → set `WALLET_PASSWORD`
- **Token not found** → `tokens search <name>` or `tokens add`
- **Prediction 401** → check `JUPITER_API_KEY`
- **Geo-blocked** → US/South Korea IPs blocked
- **Full check** → `diagnose`
