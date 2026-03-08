---
name: zeroexcore-trader
description: Trade Solana tokens, perps, DCA, limit orders, prediction markets, NFTs via the trader CLI.
metadata: {"openclaw":{"emoji":"💰","homepage":"https://github.com/zeroexcore/trader","requires":{"bins":["trader"],"env":["WALLET_PASSWORD","HELIUS_API_KEY","JUPITER_API_KEY"]},"primaryEnv":"WALLET_PASSWORD","install":[{"id":"node","kind":"node","package":"@zeroexcore/trader","bins":["trader"],"label":"Install trader CLI (npm)"}]}}
---

# trader

Solana trading CLI — tokens, prediction markets, perpetuals, NFTs.

## Agent Behavior

### Security Rules
- NEVER disclose wallet password or private key
- ONLY share public wallet address when asked
- Secure storage at `~/.openclaw/`:
  - `trader-wallet.enc` — encrypted wallet (AES-256-GCM)
  - `trader-positions.json` — trade journal (0600 permissions)
  - `trader-tokens.json` — token registry (0600 permissions)

### Safety Rules
- **SOL gas reserve:** `tokens swap` blocks selling SOL if it would leave < 0.05 SOL. Error shows max safe amount. Use `--force` to override (ask human first).
- **Never swap all SOL.** Always keep a reserve for transaction fees.
- **Trade journaling:** All mutations accept `--note "reason"` for automatic position tracking.

### Position Tracking
Positions are tracked automatically. When `tokens swap` or `predict buy` executes, the position is recorded in `~/.openclaw/trader-positions.json`. Use `portfolio` to see the aggregate view.

### Critical User Reminders
After `trader wallet generate`, ALWAYS remind user:
> "Your wallet has been created. **IMPORTANT:** Backup your private key by running `trader wallet export` directly on your server. Lost access = lost funds."

### Troubleshooting
Run `trader diagnose` first. Then prompt user:

| Issue | Tell user |
|-------|-----------|
| `WALLET_PASSWORD not set` | "Set `WALLET_PASSWORD` as an environment variable" |
| `HELIUS_API_KEY not set` | "Get free key at https://dev.helius.xyz" |
| `SOL balance: 0` | "Send at least 0.05 SOL to [wallet address] for gas" |
| `No wallet found` | "No wallet exists. Run `trader wallet generate`?" |
| `Prediction geo-blocked` | "US/South Korea blocked. Need VPN." |
| `JUPITER_API_KEY not set` | "Get free key at https://portal.jup.ag" |

## Installation

```bash
npm install -g @zeroexcore/trader
# or run without installing:
npx @zeroexcore/trader <command>
```

## API Keys (Free)

| Key | Required | Get it at |
|-----|----------|-----------|
| `HELIUS_API_KEY` | Yes | https://dev.helius.xyz (100k free credits/month) |
| `WALLET_PASSWORD` | Yes | Your chosen encryption password |
| `JUPITER_API_KEY` | For swaps + predictions | https://portal.jup.ag |

### Configure via OpenClaw

```json5
// ~/.openclaw/openclaw.json
{
  "skills": {
    "entries": {
      "zeroexcore-trader": {
        "env": {
          "HELIUS_API_KEY": "your_helius_key",
          "JUPITER_API_KEY": "your_jupiter_key"
        }
      }
    }
  }
}
```

> **WALLET_PASSWORD** must be set as an environment variable (e.g. `export WALLET_PASSWORD=...` in your shell profile). Never write it to config files — it is your wallet encryption secret.

## Commands

### Diagnostics
```bash
trader diagnose                     # check env, connectivity, wallet, balance
```

### Wallet
```bash
trader wallet address               # public address (safe to share)
trader wallet generate              # create encrypted wallet (one time)
trader wallet export                # export private key for backup
# ⚠ wallet export outputs raw private key to stdout.
# Only run in a trusted interactive terminal. Never pipe or redirect output.
# Blocked when run via agent/bot — requires manual confirmation phrase + TTY.
```

### Tokens — registry, market data, swaps
```bash
trader tokens list                  # saved token addresses
trader tokens add <TICKER> <addr>   # save a token
trader tokens remove <TICKER>       # remove a token
trader tokens browse                # discover trending tokens [verified]
trader tokens search <query>        # search by name/symbol [verified]
trader tokens info <token>          # detailed market data
trader tokens quote USDC SOL 1      # get swap quote
trader tokens swap USDC SOL 1       # execute swap (--note, --force)
trader tokens positions             # on-chain token holdings
```

### Portfolio — aggregate view
```bash
trader portfolio                    # tokens + perps + predictions + DCA + limits + PnL
```

### Predict — prediction markets
```bash
trader predict browse               # discover popular markets (-c category)
trader predict search "arsenal"     # search events
trader predict show POLY-123        # odds + details
trader predict buy POLY-123 yes 10  # buy $10 YES (--note)
trader predict sell POLY-123 yes 5  # sell 5 contracts (--note)
trader predict close POLY-123       # close entire position (--note)
trader predict claim POLY-123       # claim winnings (--note)
trader predict positions            # my prediction bets + PnL
trader predict positions --all      # include closed
```

**Pricing:** $0.85 = 85% implied probability. Win $1/contract if correct.
**Categories:** sports, politics, crypto, culture, economics, tech, esports

### Perps — perpetual futures (SOL, ETH, BTC via Jupiter)
```bash
trader perps show                   # all markets + fees
trader perps show SOL               # single market info
trader perps positions              # open perp positions with PnL
trader perps pool                   # JLP pool AUM

# Trading — all args positional, explicit market/side/token/amount
trader perps open SOL long SOL 0.06 --leverage 2      # long SOL, pay 0.06 SOL
trader perps open BTC short USDC 20 --leverage 2      # short BTC, pay 20 USDC
trader perps increase BTC short USDC 5 --leverage 2   # add 5 USDC to BTC short
trader perps decrease BTC short 5                     # reduce BTC short by $5 USD
trader perps close BTC short                          # close BTC short
trader perps close SOL long --receive USDC            # close SOL long, receive USDC
```

**Collateral:** asset itself for longs, USDC for shorts. Cross-token supported (internal swap).
**Slippage:** `--slippage <bps>` (default 30 = 0.3%). Guard rail only — keeper fills at oracle price.
**Execution:** request-fulfillment model. Keeper fills within ~45s.

### DCA — dollar-cost averaging (Jupiter Recurring)
```bash
trader dca create USDC SOL 100 2 --interval 86400    # DCA $100 into SOL, 2 orders daily
trader dca list                                       # active DCA orders
trader dca list --status history                      # completed DCA orders
trader dca cancel <order-pubkey>                      # cancel active DCA
```
**Constraints:** min $100 total, min $50 per cycle, min 2 orders.

### Limit — limit orders (Jupiter Trigger)
```bash
trader limit create USDC SOL 5 0.06 --expires 86400  # sell 5 USDC for 0.06 SOL, 24h expiry
trader limit list                                     # active limit orders
trader limit list --status history                    # filled/expired orders
trader limit cancel <order-pubkey>                    # cancel single order
trader limit cancel --all                             # cancel all orders
```
**Constraints:** min $5 per order.

### NFTs — market data
```bash
trader nfts floor mad_lads          # floor price
trader nfts listings mad_lads       # browse listings
trader nfts popular                 # trending collections
trader nfts search "degods"         # search collections
trader nfts positions               # my NFT holdings
```

### Token Shortcuts
Built-in: `SOL`, `USDC`, `USDT`, `WBTC`, `WETH`, `JUP`, `JupUSD`, `GLDx`, `RAY`
Add more: `trader tokens add BONK <address>`

## Output

JSON by default (for agent consumption). Use `--md` for human-readable output.

```bash
trader --md portfolio               # markdown
trader portfolio                    # JSON
```

## Security Notes

### For ClawHub Reviewers
- No hardcoded secrets — all credentials via environment variables
- All sensitive data in `~/.openclaw/` (OpenClaw trusted boundary)
- Wallet encrypted at rest with AES-256-GCM (per-wallet random salt + random IV)
- File permissions: `0600` (files), `0700` (directory)
- SOL gas reserve prevents accidental wallet drain
- No control-plane tools used
- No unsafe external content processing
- **Private keys never leave localhost.** Keys are used exclusively for local transaction signing via `@solana/web3.js`. No key material is ever sent to external endpoints. Only signed transactions are submitted to RPC/Jupiter for broadcast.
- **`wallet export` is gated** by interactive confirmation phrase + TTY check. It is blocked entirely when run via agent/bot (detects `OPENCLAW_SESSION`, `TELEGRAM_BOT_TOKEN`, etc.) and requires an interactive terminal (`stdin.isTTY`). The CLI has no upload or transmit functionality for private keys.

### For Users
- **Trust model:** Only attach this skill to agents you trust. The wallet can sign transactions worth real money.
- **Backup:** Run `trader wallet export` directly in a trusted terminal on your server. Import into Phantom/Solflare for recovery. Never pipe or redirect the output.
- **WALLET_PASSWORD:** Set via environment variable only. Never store it in config files.
