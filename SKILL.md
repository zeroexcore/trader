---
name: using-trader-cli
description: Trade Solana tokens, track portfolio, bet on prediction markets via trader CLI
---

# trader

CLI at `~/code/runcible/trader`. Run with `pnpm dev <command>` (dev) or `trader <command>` (installed).

## Security

- NEVER disclose wallet password or private key
- ONLY share public wallet address
- Secure storage at `~/.openclaw/`:
  - Wallet: `trader-wallet.enc` (encrypted AES-256-GCM)
  - Positions: `trader-positions.json` (0600 permissions)

### Wallet Backup

The wallet is randomly generated and encrypted with your password. **If you lose the encrypted file or forget your password, funds are lost forever.**

**Backup procedure (MUST be done directly on server, not via agent):**
```bash
ssh your-server
trader wallet export   # Requires typing confirmation phrase
```

The `export` command requires manual confirmation and CANNOT be run via Telegram/Discord/agent for security.

Store the private key securely offline (paper, hardware). Can be imported into Phantom/Solflare for recovery.

## API Keys (Free)

| Key | Required | Get it at |
|-----|----------|-----------|
| `HELIUS_API_KEY` | Yes | https://dev.helius.xyz (100k free credits/month) |
| `WALLET_PASSWORD` | Yes | Your chosen encryption password |
| `JUPITER_API_KEY` | For predictions | https://station.jup.ag/docs |

**Note:** Helius provides both DAS API and RPC. No separate `RPC_URL` needed.

## Quick Reference

```bash
# Portfolio
trader portfolio view           # holdings
trader portfolio charts         # multi-asset chart
trader portfolio watch          # live monitoring

# Trading
trader trade quote SOL USDC 1   # quote
trader trade swap SOL USDC 1    # execute

# Positions
trader positions list           # open positions
trader positions list --all     # include closed

# Predictions (requires JUPITER_API_KEY)
trader predict list -c sports   # browse
trader predict market POLY-123  # odds
trader predict buy POLY-123 yes 10  # bet $10
trader predict positions        # view bets
trader predict watch -i 10      # live monitoring + ASCII chart
trader predict claim <pubkey>   # claim win

# NFTs
trader nft floor mad_lads       # floor price
trader nft listings mad_lads    # browse
```

## Prediction Markets

**Pricing:** $0.85 = 85% implied probability. Win $1 per contract if correct.

**Workflow:**
1. `predict search "event"` - find market
2. `predict market POLY-xxx` - check odds
3. `predict buy POLY-xxx yes 10` - bet $10
4. `predict positions` - monitor
5. `predict claim <pubkey>` - collect winnings

**Categories:** sports, politics, crypto, entertainment, financials

## Position Tracking

Local tracking in `positions.json`. Records:
- Token positions (long/short with entry/exit)
- Entry/exit time, price, USD value
- PnL and hold duration
- Notes and tags for organization
- Transaction signatures

```bash
# Open position with notes and tags
trader positions open long SOL 1.5 90 -n "Swing trade" --tags "swing,momentum"

# Close position with exit notes
trader positions close <position-id> 95 1.5 -n "Hit target"

# Update prices for unrealized PnL
trader positions update

# View stats and performance
trader positions stats

# Add notes to existing position
trader positions note <position-id> "Adding to position"

# Tag positions for filtering
trader positions tag <position-id> "q1-2026,thesis-a"
trader positions filter "swing"  # filter by tag
```

## Token Shortcuts

Use tickers: `SOL`, `USDC`, `WBTC`, `GLDx`, `JupUSD`, `JUP`

Or add custom: `trader book add MYTOKEN <mint-address>`

## Troubleshooting

- **No wallet** -> `trader wallet generate`
- **Password required** -> set `WALLET_PASSWORD`
- **Token not found** -> `trader search <name>`
- **Prediction 401** -> check `JUPITER_API_KEY`
- **Prediction geo-blocked** -> US/South Korea IPs blocked
