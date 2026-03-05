---
name: zeroexcore-trader
description: Trade Solana tokens, track portfolio, bet on Jupiter prediction markets, check NFT floors via the trader CLI. Supports swaps, position tracking, and live monitoring.
metadata: {"openclaw":{"emoji":"💰","homepage":"https://github.com/zeroexcore/trader","requires":{"bins":["trader"],"env":["WALLET_PASSWORD","HELIUS_API_KEY"]},"primaryEnv":"WALLET_PASSWORD","install":[{"id":"node","kind":"node","package":"@zeroexcore/trader","bins":["trader"],"label":"Install trader CLI (npm)"}]}}
---

# trader

Solana trading CLI for portfolio management, token swaps, prediction markets, and NFTs.

## Security

- NEVER disclose wallet password or private key
- ONLY share public wallet address when asked
- Secure storage at `~/.openclaw/` (aligned with OpenClaw security model):
  - `trader-wallet.enc` - Encrypted wallet (AES-256-GCM)
  - `trader-positions.json` - Position history (0600 permissions)
- Set secrets via `~/.openclaw/openclaw.json` skills config (recommended) or environment variables

### Wallet Backup

The wallet is randomly generated and encrypted with your password. **If you lose the encrypted file or forget your password, funds are lost forever.**

**IMPORTANT:** The `export` command requires manual confirmation and CANNOT be run via agent/bot:
```bash
ssh your-server
trader wallet export   # Requires typing a confirmation phrase
```

This prevents malicious extraction of private keys via compromised agent channels.

The private key can be imported into Phantom/Solflare for recovery.

## Installation

```bash
npm install -g @zeroexcore/trader
```

## API Keys (Free)

| Key | Required | Get it at |
|-----|----------|-----------|
| `HELIUS_API_KEY` | Yes | https://dev.helius.xyz - Free tier: 100k credits/month |
| `WALLET_PASSWORD` | Yes | Your chosen password to encrypt the wallet |
| `JUPITER_API_KEY` | For predictions | https://station.jup.ag/docs - Free, request access |

**Note:** `HELIUS_API_KEY` provides both the DAS API (portfolio data) and RPC endpoint. No separate `RPC_URL` needed.

### Configure via OpenClaw (Recommended)

```json5
// ~/.openclaw/openclaw.json
{
  "skills": {
    "entries": {
      "zeroexcore-trader": {
        "enabled": true,
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

## Commands

### Wallet
```bash
trader wallet generate    # Create encrypted wallet (one-time)
trader wallet address     # Get public address (safe to share)
trader wallet export      # Export private key for backup (KEEP SECRET)
```

### Portfolio
```bash
trader portfolio view           # Holdings with USD values
trader portfolio view -c        # With sparkline charts
trader portfolio charts         # Multi-asset performance chart
trader portfolio watch          # Live monitoring (Ctrl+C to stop)
trader portfolio pnl <token>    # PnL for specific token
trader portfolio chart <token>  # Price chart with trade markers
```

### Trading
```bash
trader trade quote SOL USDC 1   # Get swap quote
trader trade swap SOL USDC 1    # Execute swap via Jupiter
```

### Positions
```bash
trader positions list           # Open positions
trader positions list --all     # Include closed
trader positions stats          # Performance statistics
trader positions open long SOL 1.5 90  # Track new position
trader positions open long SOL 1.5 90 -n "Swing trade" --tags "swing"  # With notes/tags
trader positions close <id> 95 1.5     # Close position
trader positions close <id> 95 1.5 -n "Hit target"  # With exit notes
trader positions update         # Refresh prices
trader positions note <id> "Adding context"   # Add notes
trader positions tag <id> "q1,thesis-a"       # Add tags
trader positions filter "swing"               # Filter by tag
trader positions show <id>                    # Show single position
```

Position tracking captures:
- Entry/exit time, price, USD value
- PnL amount and percentage
- Hold duration
- Notes and tags
- Transaction signatures (optional)

### Predictions (Jupiter)

**Note:** Requires `JUPITER_API_KEY`. Geo-blocked in US/South Korea.

```bash
trader predict list -c sports   # Browse by category
trader predict search "NBA"     # Search events
trader predict market POLY-123  # View odds
trader predict buy POLY-123 yes 10     # Bet $10 on YES
trader predict positions        # View bets
trader predict watch -i 10      # Live monitoring + ASCII chart
trader predict sell POLY-123 yes 5     # Sell 5 contracts
trader predict close POLY-123   # Close entire position
trader predict claim <pubkey>   # Claim winnings
```

**Pricing:** $0.85 = 85% implied probability. Win $1 per contract if correct.

**Categories:** sports, politics, crypto, entertainment, financials

### NFTs
```bash
trader nft floor mad_lads       # Floor price
trader nft listings mad_lads    # Browse listings
trader nft popular              # Trending collections
trader nft search <query>       # Search collections
trader nft portfolio            # Your NFT holdings
```

### Perpetuals (Jupiter)
```bash
trader perps pool       # JLP pool stats
trader perps markets    # Available markets + fees
trader perps positions  # Your open perps positions
trader perps info       # How perps work
```

### Token Utilities
```bash
trader search <query>           # Search tokens
trader info <token>             # Detailed token info
trader book list                # View saved tokens
trader book add MYTOKEN <mint>  # Add custom token
trader book remove MYTOKEN      # Remove token
```

**Built-in tickers:** `SOL`, `USDC`, `WBTC`, `GLDx`, `JupUSD`, `JUP`

## Troubleshooting

| Issue | Solution |
|-------|----------|
| No wallet | `trader wallet generate` |
| Password required | Set `WALLET_PASSWORD` in env or openclaw.json |
| Token not found | `trader search <name>` |
| Prediction 401 | Check `JUPITER_API_KEY` |
| Prediction geo-blocked | US/South Korea IPs blocked |
| RPC errors | Verify `HELIUS_API_KEY` is valid |

## Security Notes

### For ClawHub Reviewers
- No hardcoded secrets - all credentials via environment variables
- All sensitive data stored in `~/.openclaw/` (OpenClaw trusted boundary)
- Wallet encrypted at rest with AES-256-GCM
- File permissions: `0600` (wallet, positions), `0700` (directory)
- No control-plane tools (`gateway`, `cron`, `sessions_spawn`) used
- No unsafe external content processing

### For Users
- **Trust model:** Only attach this skill to agents you trust. The wallet can sign transactions worth real money.
- **Sandbox users:** If running in sandbox mode, add to your config:
  ```json5
  {
    "agents": {
      "defaults": {
        "sandbox": {
          "docker": {
            "network": "bridge",
            "setupCommand": "npm install -g @zeroexcore/trader"
          }
        }
      }
    }
  }
  ```
