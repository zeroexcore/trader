# Changelog

## v3.0.0

Perps trading, DCA orders, limit orders.

### Perps — full trading lifecycle
- **Open/close/increase/decrease** positions on SOL, ETH, BTC
- Direct Anchor transactions to Jupiter Perpetuals program (request-fulfillment model)
- Explicit positional CLI args: `perps open SOL long SOL 0.06 --leverage 2`
- Oracle-based slippage (default 30 bps) — guard rail only, keeper fills at oracle price
- Cross-token support (e.g. pay USDC for SOL long, internal swap handled)
- On-chain position reader with PnL via Anchor IDL

### DCA — dollar-cost averaging
- Jupiter Recurring API integration
- `dca create USDC SOL 100 2 --interval 86400` — 2 daily buys totaling $100
- `dca list` / `dca cancel <pubkey>`
- Min $100 total, $50/cycle, 2 orders

### Limit orders
- Jupiter Trigger API integration
- `limit create USDC SOL 5 0.06 --expires 86400` — sell 5 USDC for 0.06 SOL
- `limit list` / `limit cancel <pubkey>` / `limit cancel --all`
- Min $5 per order

### Portfolio
- Now includes perps positions, active DCA orders, and active limit orders
- All data fetched in parallel

### Skill docs
- Updated openclaw-skill.md with all new commands and constraints

## v2.0.0

Testing, safety, API migrations.

### Testing
- Vitest test suite: 150 tests across 12 test files
- Coverage for all commands (tokens, predict, perps, portfolio, diagnose, NFTs)
- Coverage for utilities (wallet, amounts, positions, token-book, config)
- Test helpers for mocking config, wallet, and API responses

### Safety & validation
- NaN validation on predict buy/sell amounts
- Improved swap quote error handling
- Better position tracking with enriched exit data (exitAmount, exitValueUsd, pnlPercent)

### API migrations
- Jupiter Token API V2 (token.jup.ag → api.jup.ag/tokens/v2)
- Verified badge on token browse/search results

### Cleanup
- Removed legacy TypeScript IDL files (doves-idl.ts, jupiter-perpetuals-idl.ts) — using JSON IDL
- Switched to JSON import assertions for IDL
- Case-insensitive token ticker resolution

## v1.0.0

Initial release.

### Core
- Encrypted wallet (AES-256-GCM) with generate/export/address
- Token registry with add/remove/list
- Jupiter swap integration with quotes and execution
- On-chain portfolio via Helius DAS API
- SOL gas reserve safety check (blocks selling below 0.05 SOL)
- Helius Sender support for low-latency tx submission

### Prediction markets
- Jupiter prediction markets: browse, search, show, buy, sell, close, claim
- Live position tracking with PnL
- Trade journaling with `--note` flag

### Perps (read-only)
- Market stats, pool info, position viewer via Anchor IDL

### NFTs
- Floor prices, listings, popular collections, search, holdings

### CLI
- JSON output by default, `--md` for human-readable
- `diagnose` command for environment checks
- Modular command structure with centralized config
- OpenClaw security model (no control-plane tools, encrypted secrets)
