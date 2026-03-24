# moltiverse-mcp

A unified [Model Context Protocol](https://modelcontextprotocol.io) server that gives AI agents full access to the Moltiverse ecosystem across [Ink](https://inkonchain.com) and [Solana](https://solana.com) — Sentry Launch Factory (EVM + SVM), Orca Whirlpool DEX, Tsunami V3 DEX, Tydro lending, NADO perps, Citadel LP Locker, ZNS .ink domain names, ERC-8004 agent identity, DailyGM, on-chain analytics via Goldsky subgraph, cross-chain bridging/swaps via Relay Protocol, and CEX trading via [Kraken CLI](https://github.com/krakenfx/kraken-cli) (134 commands).

## Quick Start

### 1. Install

**macOS / Linux:**
```bash
curl -sL https://web-production-7d3e.up.railway.app/api/molting/install | sh
```

**Windows (PowerShell):**
```powershell
irm https://web-production-7d3e.up.railway.app/api/molting/install.ps1 | iex
```

This writes a `.mcp.json` to your current directory, installs the MCP package, and drops `MOLTIVERSE.md` + skill files so your agent knows what it can do.

### 2. Set Your EVM Private Key

**Local (macOS Keychain / Windows Credential Manager / Linux libsecret):**
```bash
npx --package=moltiverse-mcp moltiverse-mcp-setup
```
Enter your `0x`-prefixed private key once — stored securely in your OS keychain, never in any config file.

**Server / Railway (env var):**
```
EVM_PRIVATE_KEY=0x...
```

### 3. Run the MCP Server

```bash
npx moltiverse-mcp
```

### Claude Code (`.mcp.json`)

The install script writes this automatically. Or create it manually in your project root:

```json
{
  "mcpServers": {
    "moltiverse": {
      "command": "npx",
      "args": ["moltiverse-mcp"],
      "env": {}
    }
  }
}
```

Add `"EVM_PRIVATE_KEY": "0x..."` to `env` only if you're on a server and skipped the keychain setup.

### Claude Desktop

Add to your `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "moltiverse": {
      "command": "npx",
      "args": ["moltiverse-mcp"],
      "env": {}
    },
    "kraken": {
      "command": "kraken",
      "args": ["mcp", "-s", "all"],
      "env": {
        "KRAKEN_API_KEY": "your-kraken-api-key",
        "KRAKEN_API_SECRET": "your-kraken-api-secret"
      }
    }
  }
}
```

## Environment Variables

### Moltiverse MCP

| Variable | Required | Description |
|---|---|---|
| `EVM_PRIVATE_KEY` | Optional | EVM private key (0x-prefixed). Set for server/Railway deployments. Local users use `npx moltiverse-mcp-setup` instead (OS keychain). |
| `RPC_URL` | Optional | Custom Ink RPC endpoint. Defaults to `https://rpc-gel.inkonchain.com`. |
| `MOLTING_API_KEY` | Optional | Bearer token from MOLTING registration. Used for token indexing after `sentry_launch`. |
| `SENTRY_API_BASE` | Optional | MOLTING API base URL. Defaults to the public endpoint. |

| `SOL_PRIVATE_KEY` | Optional | Solana private key (base58 string or JSON byte array). Required for `solana_orca_swap`. |
| `SOLANA_RPC_URL` | Optional | Custom Solana RPC endpoint. Defaults to `https://api.mainnet-beta.solana.com`. |

Read-only tools work without any environment variables.

### Kraken CLI (optional)

| Variable | Required | Description |
|---|---|---|
| `KRAKEN_API_KEY` | For spot trading | Kraken API key |
| `KRAKEN_API_SECRET` | For spot trading | Kraken API secret |
| `KRAKEN_FUTURES_API_KEY` | For futures | Kraken Futures API key |
| `KRAKEN_FUTURES_API_SECRET` | For futures | Kraken Futures API secret |

Public market data and paper trading work without credentials. Install the CLI from [github.com/krakenfx/kraken-cli](https://github.com/krakenfx/kraken-cli).

## Tools (85 on-chain + 134 via Kraken CLI)

### Solana — Sentry Launch Factory (5 tools)

| Tool | Type | Description |
|---|---|---|
| `solana_sentry_agent_launch` | Write | Deploy a token on Solana via the Sentry Launch Factory API. Requires 8004 agent identity. API handles metadata upload, all PDA derivation, ALT creation, and Orca CLMM pool setup. |
| `solana_sentry_submit` | Write | Submit a signed agent launch transaction to the network |
| `solana_sentry_lookup` | Read | Look up a factory-deployed token by mint address — returns creator, pool, timestamps, agent flag |
| `solana_sentry_list` | Read | List all tokens deployed through the factory. Filter by creator or agent-only. |
| `solana_sentry_stats` | Read | Factory stats: total launches, admin, treasury, buyback config |

### Solana — Orca Whirlpool DEX (3 tools)

| Tool | Type | Description |
|---|---|---|
| `solana_orca_pool_info` | Read | Get Orca Whirlpool state for a token pair: price, liquidity, tick, fee rate |
| `solana_orca_quote` | Read | Estimate swap output for a given input amount on an Orca pool |
| `solana_orca_swap` | Write | Execute a direct swap on an Orca Whirlpool (requires `SOL_PRIVATE_KEY`) |

### Tsunami V3 DEX (13 tools)

| Tool | Type | Description |
|---|---|---|
| `tsunami_quote_exact_input` | Read | Get swap quote for exact input amount |
| `tsunami_quote_exact_output` | Read | Get swap quote for exact output amount |
| `tsunami_swap_exact_input` | Write | Execute swap with exact input |
| `tsunami_swap_exact_output` | Write | Execute swap for exact output |
| `tsunami_get_pool` | Read | Get pool address and state for a token pair |
| `tsunami_get_pool_info` | Read | Full pool state: tick, liquidity, prices |
| `tsunami_create_pool` | Write | Create and initialize a new pool |
| `tsunami_mint_position` | Write | Mint a new concentrated liquidity position |
| `tsunami_add_liquidity` | Write | Add liquidity to an existing position |
| `tsunami_remove_liquidity` | Write | Remove liquidity (burns NFT if 100%) |
| `tsunami_collect_fees` | Write | Collect accrued trading fees |
| `tsunami_get_position` | Read | Get full position details by token ID |
| `tsunami_get_user_positions` | Read | List all LP positions for an address |

### Sentry Agent Launch Factory (6 tools)

| Tool | Type | Description |
|---|---|---|
| `sentry_launch` | Write | Deploy a token, create Tsunami V3 pool, and permanently lock single-sided LP in the factory |
| `sentry_get_creator_nfts` | Read | Get all LP NFT IDs for a creator |
| `sentry_get_token_by_nft` | Read | Get token address from LP NFT ID |
| `sentry_get_supported_base_tokens` | Read | List supported base tokens (e.g. WETH) |
| `sentry_get_total_deployed` | Read | Total tokens launched through Sentry |
| `sentry_collect_fees` | Write | Harvest trading fees from LP positions — owner only, sent to treasury |

### ERC-8004 Agent Identity (6 tools)

[ERC-8004](https://eips.ethereum.org/EIPS/eip-8004) is the Ethereum standard for on-chain AI agent identity (co-authored by MetaMask, Ethereum Foundation, Google, Coinbase). On Ink, the IdentityRegistry is **required before launching tokens via `sentry_launch()`**.

| Tool | Type | Description |
|---|---|---|
| `identity_register` | Write | Register an ERC-8004 agent identity — mints an identity NFT. Required before `sentry_launch()`. |
| `identity_check_registered` | Read | Check if a wallet holds an identity NFT (prerequisite for token launches) |
| `identity_get_agent` | Read | Get agentURI and decoded metadata for an agent ID |
| `identity_set_agent_uri` | Write | Update identity metadata (owner only) |
| `identity_get_owner_agents` | Read | List all agent identity token IDs for a wallet |
| `identity_total_registered` | Read | Total ERC-8004 identities registered on Ink |

### Tydro Lending (7 tools)

Tydro is Aave V3 deployed on Ink with 12 supported assets.

| Tool | Type | Description |
|---|---|---|
| `tydro_get_reserve_data` | Read | Get reserve APY, liquidity, utilization, and configuration for an asset |
| `tydro_get_user_account` | Read | Get total collateral, debt, available borrow, health factor for a wallet |
| `tydro_get_user_reserve` | Read | Get a wallet's supplied and borrowed balance for a specific asset |
| `tydro_supply` | Write | Supply an asset to earn yield (auto-approves) |
| `tydro_borrow` | Write | Borrow an asset against your collateral |
| `tydro_repay` | Write | Repay borrowed debt (auto-approves) |
| `tydro_withdraw` | Write | Withdraw supplied assets |

Supported assets: WETH, kBTC, USDT0, USDG, GHO, USDC, weETH, wrsETH, ezETH, sUSDe, USDe, SolvBTC

### NADO Perps DEX (11 tools)

NADO is a perpetuals and spot DEX on Ink powered by the Vertex Protocol engine, offering up to 20x leverage on a central limit order book.

| Tool | Type | Description |
|---|---|---|
| `nado_get_markets` | Read | List all spot and perp markets with product IDs |
| `nado_get_market_price` | Read | Get best bid/ask and mark price for a market |
| `nado_get_candlesticks` | Read | OHLCV candlestick data (1m, 5m, 1h, 1d, etc.) |
| `nado_get_funding_rate` | Read | Current and historical funding rates for a perp market |
| `nado_get_account` | Read | Get subaccount summary: balances, margin, PnL |
| `nado_get_positions` | Read | List open perpetual positions for a subaccount |
| `nado_get_open_orders` | Read | List open orders for a subaccount |
| `nado_get_trade_history` | Read | Recent fill history for a subaccount |
| `nado_place_order` | Write | Place a limit or market order (EIP-712 signed) |
| `nado_cancel_order` | Write | Cancel a specific order by digest |
| `nado_cancel_all` | Write | Cancel all open orders for a subaccount |

### ZNS Connect — .ink Domains (6 tools)

ZNS Connect is the domain naming service for Ink. Agents can register `.ink` domain names mapped to their EVM addresses for human-readable on-chain identities.

| Tool | Type | Description |
|---|---|---|
| `zns_resolve_domain` | Read | Resolve a .ink domain name to its owner wallet address |
| `zns_resolve_address` | Read | Reverse lookup: find .ink domain(s) owned by a wallet address |
| `zns_check_domain` | Read | Check whether a .ink domain is available for registration |
| `zns_get_metadata` | Read | Get metadata for a registered .ink domain (avatar, bio, links) |
| `zns_get_price` | Read | Get the registration price for one or more .ink domains |
| `zns_register` | Write | Register one or more .ink domain names to wallet addresses |

### Citadel LP Locker (9 tools)

| Tool | Type | Description |
|---|---|---|
| `citadel_lock_lp` | Write | Lock an LP NFT for a specified duration |
| `citadel_unlock` | Write | Unlock an LP NFT after lock period |
| `citadel_collect_fees` | Write | Collect fees from locked positions |
| `citadel_get_lock_info` | Read | Get lock metadata for an NFT |
| `citadel_get_locker_nfts` | Read | List all NFTs locked by an address |
| `citadel_is_locked` | Read | Check if an NFT is locked |
| `citadel_is_unlockable` | Read | Check if lock period has expired |
| `citadel_get_stats` | Read | Total locked count and Sentry locks |
| `citadel_supply_tydro` | Write | Supply collected fees to Tydro for yield |

### ERC-20 (4 tools)

| Tool | Type | Description |
|---|---|---|
| `erc20_balance` | Read | Get token balance for an address (use zero address for native ETH) |
| `erc20_allowance` | Read | Check spending allowance |
| `erc20_approve` | Write | Approve a spender |
| `erc20_transfer` | Write | Transfer ERC-20 tokens or native ETH (use zero address for ETH) |

### DailyGM (3 tools)

On-chain "Good Morning" protocol. Say GM, send a GM to someone, or check when someone last said GM — all recorded immutably on Ink.

| Tool | Type | Description |
|---|---|---|
| `dailygm_gm` | Write | Say GM on-chain (once per 24 hours) |
| `dailygm_gm_to` | Write | Send a GM to a specific address (once per 24 hours, cannot GM yourself) |
| `dailygm_last_gm` | Read | Check when a wallet last said GM and whether they can GM again |

### Subgraph Analytics (6 tools)

| Tool | Type | Description |
|---|---|---|
| `subgraph_protocol_stats` | Read | TVL, volume, fees, transaction count |
| `subgraph_pools` | Read | Paginated pool list with TVL sorting |
| `subgraph_recent_swaps` | Read | Latest swap events |
| `subgraph_user_positions` | Read | LP positions for a wallet |
| `subgraph_user_transactions` | Read | Mint/burn/swap history |
| `subgraph_daily_data` | Read | Historical daily metrics |

### Relay Protocol (6 tools)

| Tool | Type | Description |
|---|---|---|
| `relay_get_chains` | Read | List all 50+ supported chains |
| `relay_get_currencies` | Read | Search tokens across chains |
| `relay_get_quote` | Read | Get cross-chain bridge/swap quote with fees |
| `relay_get_price` | Read | Fast price estimate (no executable steps) |
| `relay_get_token_price` | Read | Get USD price of any token |
| `relay_get_requests` | Read | Check bridge/swap transaction status |

### Kraken CLI (134 commands)

| Group | Commands | Description |
|---|---|---|
| `market` | 10 | Ticker, orderbook, OHLC, trades, spreads |
| `account` | 18 | Balances, orders, trades, ledgers, positions |
| `trade` | 9 | Order placement, amendment, cancellation |
| `funding` | 10 | Deposits, withdrawals, wallet transfers |
| `earn` | 6 | Staking strategies and allocations |
| `futures` | 39 | Futures market data and trading |
| `websocket` | 15 | Spot WebSocket v2 streaming |
| `paper` | 10 | Paper trading simulation |

```bash
kraken mcp                           # read-only
kraken mcp -s all                    # full access
kraken mcp -s all --allow-dangerous  # autonomous mode
```

## Program & Contract Addresses

### Solana (Mainnet)

| Program / Account | Address |
|---|---|
| Sentry Launch Factory | `FVrGHhqAB8wk63nnT7npNRFwBgjsRWUvCpuaapuSTKX1` |
| Orca Whirlpool Program | `whirLbMiicVdio4qvUfM5KAg6Ct8VwpYzGff3uctyCc` |
| Orca Whirlpools Config | `2LecshUwdy9xi7meFgHtFJQNSKk4KdTrcpvaB56dP2NQ` |

## Contract Addresses (Ink — Chain ID 57073)

### Tsunami V3

| Contract | Address |
|---|---|
| TsunamiV3Factory | `0xD8B0826150B7686D1F56d6F10E31E58e1BCF1193` |
| TsunamiV3PositionManager | `0x98b6267DA27c5A21Bd6e3edfBC2DA6b0428Fa9F7` |
| TsunamiQuoterV2 | `0x547D43a6F83A28720908537Aa25179ff8c6A6411` |
| TsunamiSwapRouter02 | `0x4415F2360bfD9B1bF55500Cb28fA41dF95CB2d2b` |

### Sentry & Citadel

| Contract | Address |
|---|---|
| SentryAgentLaunchFactory (Proxy) | `0x733733E8eAbB94832847AbF0E0EeD6031c3EB2E4` |
| Citadel LP Locker | `0x111474f3062E9B8B7B9d568675c5bb1262d6F862` |

### Tydro (Borrow/Lending Markets)

| Contract | Address |
|---|---|
| Pool | `0x2816cf15F6d2A220E789aA011D5EE4eB6c47FEbA` |
| PoolDataProvider | `0x96086C25d13943C80Ff9a19791a40Df6aFC08328` |

### NADO (CLOB DEX, Perps Trading)

| Contract | Address |
|---|---|
| Endpoint | `0x05ec92D78ED421f3D3Ada77FFdE167106565974E` |

### ERC-8004 Agent Identity

| Contract | Address |
|---|---|
| IdentityRegistry (implementation — active) | `0x7274e874CA62410a93Bd8bf61c69d8045E399c02` |
| IdentityRegistry (proxy — pending upgrade) | `0x8004A169FB4a3325136EB29fA0ceB6D2e539a432` |
| ReputationRegistry (proxy) | `0x8004BAa17C55a88189AE136b182e5fdA19dE9b63` |
| ValidationRegistry (proxy) | `0x8004Cc8439f36fd5F9F049D9fF86523Df6dAAB58` |

### DailyGM

| Contract | Address |
|---|---|
| DailyGM | `0x9F500d075118272B3564ac6Ef2c70a9067Fd2d3F` |

### ZNS Connect

| Contract | Address |
|---|---|
| ZNS Registry | `0xFb2Cd41a8aeC89EFBb19575C6c48d872cE97A0A5` |

### Tokens

| Token | Address |
|---|---|
| WETH9 | `0x4200000000000000000000000000000000000006` |
| USDT0 | `0x0200C29006150606B650577BBE7B6248F58470c1` |
| NAMI | `0x40f297b5a31FB7D28169Ba75666bea38122860c2` |
| SENTRY | `0x94CfB34d41E94687cD8A56c0624AaA0c8080cd93` |
| MOLTING | `0x63d49DF9B08da5dAA254c66BDacA0A481Ec5d89f` |

## Architecture

```
+------------------------------------------------------------------------------+
|                          AI Agent (Claude, etc.)                              |
+-------------------+--------------------------------------+-------------------+
                    | MCP (stdio)                          | MCP (stdio)
+-------------------v------------------------------------------+ +--v---------+
|                   moltiverse-mcp (v1.11.0)                     | | kraken mcp |
|                          85 tools                              | |134 commands|
|  +-----------+ +-----------+ +-----------+ +-----------+        | | market     |
|  | Tsunami   | |  Sentry   | |  Tydro    | |   NADO    |        | | account    |
|  | 13 tools  | |  6 tools  | |  7 tools  | | 11 tools  |        | | trade      |
|  +-----------+ +-----------+ +-----------+ +-----------+        | | funding    |
|  | Citadel   | | Subgraph  | |   ERC20   | |   Relay   |        | | earn       |
|  |  9 tools  | |  6 tools  | |  4 tools  | |  6 tools  |        | | futures    |
|  +-----------+ +-----------+ +-----------+ +-----------+        | | ws  paper  |
|  |    ZNS    | | Identity  | | DailyGM   |                      | +-----+------+
|  |  6 tools  | |  6 tools  | |  3 tools  |                      |       |
|  +-----------+ +-----------+ +-----------+                      |       |
|  | Sol Sentry| | Sol Orca  |                                     |       |
|  |  5 tools  | |  3 tools  |                                     |       |
|  +-----------+ +-----------+                                     |       |
+--------------------------------------------------------------------------+   |
         |             |              |              |                    |
    Ink L2 RPC     Goldsky        Ink L2 RPC    NADO APIs           Kraken API
     (57073)       GraphQL         (57073)     archive +          (spot+futures)
    Tsunami /      Tsunami        Tydro /      gateway +
    Sentry /       Subgraph        ERC20       Relay API
    Citadel /                    Identity    (50+ chains)
    ZNS / GM                     Sol RPC
```

## Documentation

- [Tsunami V3 DEX](docs/tsunami-v3-dex.md)
- [Sentry Agent Launch Factory](docs/sentry-agent-launch-factory.md)
- [Citadel LP Locker](docs/citadel-lp-locker.md)
- [Relay Protocol](docs/relay-protocol.md)
- [Tydro Lending Protocol](docs/tydro-lending.md)
- [NADO Perps DEX](docs/nado-perps-dex.md)
- [ZNS Connect — .ink Domains](docs/zns-names.md)
- [ERC-8004 Agent Identity](docs/erc8004-identity.md)

## Agent Skills

Step-by-step playbooks for common agent workflows — multi-step sequences, parameter gotchas, and cross-protocol flows.

- [Solana Sentry Skills](docs/skills/solana-sentry-skills.md) — Deploying tokens on Solana, querying the factory registry
- [Solana Swap Skills](docs/skills/solana-swap-skills.md) — Swapping on Orca Whirlpools, Jupiter aggregator, dev buys
- [Tsunami Skills](docs/skills/tsunami-skills.md) — Swapping, LP management, buying NAMI
- [Sentry Skills](docs/skills/sentry-skills.md) — Launching tokens
- [Citadel Skills](docs/skills/citadel-skills.md) — Locking LP, collecting and routing fees
- [Tydro Skills](docs/skills/tydro-skills.md) — Supplying, borrowing, health factor management
- [NADO Skills](docs/skills/nado-skills.md) — Perps trading, order types, subaccounts
- [Relay Skills](docs/skills/relay-skills.md) — Bridging, acquiring USDT0 for NAMI purchases
- [ERC-20 Skills](docs/skills/erc20-skills.md) — Balances, approvals, native ETH transfers
- [Subgraph Skills](docs/skills/subgraph-skills.md) — Analytics, pool discovery, position tracking
- [ZNS Skills](docs/skills/zns-skills.md) — Registering .ink domains, resolving names, sending tokens to domains
- [Identity Skills](docs/skills/identity-skills.md) — Registering ERC-8004 agent identity (required for token launches)
- [DailyGM Skills](docs/skills/dailygm-skills.md) — Saying GM on-chain, sending GMs, checking cooldowns

## License

MIT
