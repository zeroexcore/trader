---
name: using-trader-cli
description: Trade Solana tokens, track portfolio, bet on prediction markets via openclaw-trader CLI
---

# openclaw-trader

CLI at `~/code/runcible/trader`. Run with `pnpm dev <command>`.

## Security

- NEVER disclose wallet password or private key
- ONLY share public wallet address
- Wallet at `~/.openclaw/trader-wallet.enc`

## Quick Reference

```bash
# Portfolio
pnpm dev portfolio view           # holdings
pnpm dev portfolio charts         # multi-asset chart
pnpm dev portfolio watch          # live monitoring

# Trading
pnpm dev trade quote SOL USDC 1   # quote
pnpm dev trade swap SOL USDC 1    # execute

# Positions
pnpm dev positions list           # open positions
pnpm dev positions list --all     # include closed

# Predictions
pnpm dev predict list -c sports   # browse
pnpm dev predict market POLY-123  # odds
pnpm dev predict buy POLY-123 yes 10  # bet $10
pnpm dev predict positions        # view bets
pnpm dev predict watch            # live monitoring
pnpm dev predict claim <pubkey>   # claim win

# NFTs
pnpm dev nft floor mad_lads       # floor price
pnpm dev nft listings mad_lads    # browse
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
- Prediction bets (syncs with Jupiter API)

```bash
# Open position
pnpm dev positions open long SOL 1.5 90

# Close position  
pnpm dev positions close <position-id> 95 1.5

# Update prices
pnpm dev positions update
```

## Token Shortcuts

Use tickers: `SOL`, `USDC`, `WBTC`, `GLDx`, `JupUSD`, `JUP`

Or add custom: `pnpm dev book add MYTOKEN <mint-address>`

## Environment

```bash
HELIUS_API_KEY=xxx      # required
WALLET_PASSWORD=xxx     # required  
JUPITER_API_KEY=xxx     # for predictions
RPC_URL=xxx             # optional
```

## Troubleshooting

- **No wallet** → `pnpm dev wallet generate`
- **Password required** → set `WALLET_PASSWORD`
- **Token not found** → `pnpm dev search <name>`
- **Prediction 401** → check `JUPITER_API_KEY`
- **Prediction geo-blocked** → US/South Korea IPs blocked
