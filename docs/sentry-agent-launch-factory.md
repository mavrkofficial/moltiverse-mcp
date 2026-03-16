# Sentry Agent Launch Factory

## Overview

The Sentry Agent Launch Factory is a token launchpad contract deployed on Ink that enables AI agents and users to deploy a fully tradable ERC-20 token with a single transaction. It is designed to be the most capital-efficient way to create a low-cap token with immediate on-chain liquidity — no seed capital required, no manual pool setup, no multi-step process.

When a creator launches a token through Sentry, the factory atomically:

1. Deploys a new ERC-20 token contract
2. Creates a Tsunami V3 concentrated liquidity pool
3. Mints a single-sided LP position at a 1% fee tier
4. Permanently holds the LP NFT in the factory (no external locker required)
5. Emits indexable events for frontends and analytics

The entire launch happens in one transaction. The resulting token is immediately tradable on Tsunami V3 with locked liquidity that can never be removed.

---

## Why Sentry Is the Most Capital-Efficient Launch Method

### No Seed Liquidity Required

Traditional token launches require the creator to deposit both sides of a liquidity pair — the new token plus a base asset like ETH. Sentry eliminates this entirely.

The factory uses **single-sided liquidity provisioning**. Because Tsunami V3 allows positions to be opened at price ranges entirely above or below the current tick, the factory deposits 100% of the new token's supply into one side of the pool without any base token. The market forms naturally as the first buyers swap base tokens into the pool.

### Ink L2 Economics

Ink is an Optimism-based L2 where transaction costs are a fraction of a cent. Deploying a token, creating a pool, minting an LP position, and locking it all in one transaction costs effectively nothing.

### Concentrated Liquidity Efficiency

Unlike constant-product AMMs, Tsunami V3's concentrated liquidity means the launched token's liquidity is concentrated in a specific price range, providing:

- **Deeper liquidity at relevant prices** — capital is not wasted at unreachable prices
- **Better execution for traders** — less slippage per dollar of liquidity
- **Higher fee generation for the LP** — more trades occur in the active range

---

## How a Launch Works

### Step 1: Token Deployment

The factory deploys a new `SentryTokenStandard` contract — a minimal ERC-20:

| Property | Value |
|---|---|
| **Total Supply** | 1,000,000,000 (1 billion) tokens |
| **Decimals** | 18 |
| **Ownership** | Renounced at deployment (owner set to `0x...dEaD`) |
| **Meta-Transactions** | ERC-2771 support via Gelato trusted forwarder |
| **Minting** | None — fixed supply |
| **Burning** | None |

The entire supply is minted to the factory at deployment. Ownership is immediately and irrevocably renounced.

### Step 2: Pool Manager Consultation

The factory consults the registered pool manager for the chosen base token to get mint parameters:

- `sqrtPriceX96` — initial pool price
- `tickLower` / `tickUpper` — concentrated liquidity range
- `amount0Desired` / `amount1Desired` — amounts to deposit
- `amount0Min` / `amount1Min` — slippage protection

### Step 3: Pool Creation

The factory calls `createAndInitializePoolIfNecessary` on the Tsunami V3 Position Manager. All Sentry launches use the **1% fee tier** (10,000 bps, tick spacing 200).

### Step 4: LP Position Minting

The factory mints a single-sided concentrated liquidity position. The recipient is always `address(this)` — the factory permanently holds the LP NFT. There is no transfer or unlock function.

### Step 5: Creator Tracking

The factory records every launch:

- `nftCreators[tokenId] → creator address`
- `creatorNFTs[creator] → tokenId[]`
- `tokenIdToToken[tokenId] → token address`

---

## Fee Collection

All trading fees from Sentry-launched pools accrue to the factory-held LP positions. **Only the factory owner can collect fees.**

When fees are collected, the factory automatically routes them:

- **WETH fees** → swapped to **MOLTING** token via Tsunami V3 (`exactInputSingle`, 1% fee tier) — creating buy pressure on MOLTING with every fee harvest
- **Meme token fees** → sent directly to the treasury

If the MOLTING swap fails (e.g. insufficient liquidity), the WETH falls back to treasury. This ensures fee collection never reverts.

```
collectFees(tokenId)              — collect fees from one LP position, auto-buy MOLTING with WETH side
collectMultipleFees(tokenIds[])   — batch collect from multiple positions
```

The treasury address is updatable by the factory owner via `updateTreasury(newTreasury)`.

### Fee Routing Constants (V3)

| Constant | Value |
|---|---|
| `WETH9` | `0x4200000000000000000000000000000000000006` |
| `MOLTING` | `0x63d49DF9B08da5dAA254c66BDacA0A481Ec5d89f` |
| `SWAP_ROUTER` | `0x4415F2360bfD9B1bF55500Cb28fA41dF95CB2d2b` |
| `MOLTING_POOL_FEE` | `10000` (1%) |

---

## Upgradeable Architecture

The factory is deployed behind a `TransparentUpgradeableProxy` with a `ProxyAdmin`:

- Logic can be upgraded without changing the contract address
- All state (creator mappings, NFT custody, configuration) is preserved across upgrades
- `initialize()` replaces the constructor and can only be called once
- `__gap[49]` reserves storage slots for future state variables

---

## ERC-2771 Meta-Transactions

Both the factory and deployed tokens support ERC-2771 via Gelato's 1Balance relay:

- **Gasless token launches** — relayer pays gas, creator signs meta-transaction
- **Gasless token transfers** — holders can send tokens without holding ETH

---

## Multi-Base Token Support

```
addBaseToken(baseToken, poolManager)    — register a new base token
updatePoolManager(baseToken, manager)   — swap pool manager for a base token
removeBaseToken(baseToken)              — unregister a base token
getSupportedBaseTokens()                — list all registered base tokens
```

---

## Events

| Event | Description |
|---|---|
| `TokenDeployed(token, name, symbol, creator, tokenId)` | New token launched |
| `PoolInitialized(pool, token)` | Tsunami V3 pool created |
| `LiquidityMinted(tokenId, pool, token)` | LP position minted |
| `LPLocked(tokenId, pool, token)` | LP NFT permanently held by factory |
| `FeesCollected(tokenId, amount0, amount1)` | Trading fees harvested |
| `MoltingBought(tokenId, wethIn, moltingOut)` | WETH fees swapped to MOLTING (V3) |
| `BaseTokenAdded(baseToken, manager)` | New base token registered |
| `BaseTokenRemoved(baseToken)` | Base token unregistered |
| `PoolManagerUpdated(baseToken, oldManager, newManager)` | Pool manager changed |
| `TreasuryUpdated(oldTreasury, newTreasury)` | Treasury address changed |

---

## View Functions

| Function | Returns |
|---|---|
| `getPoolManager(baseToken)` | Pool manager address for a base token |
| `getSupportedBaseTokens()` | Array of all registered base token addresses |
| `getCreator(tokenId)` | Creator address for an LP NFT |
| `getCreatorNFTs(creator)` | Array of all LP NFT IDs created by an address |
| `getCreatorNFTCount(creator)` | Number of tokens launched by an address |
| `getTokenByNFT(tokenId)` | Token contract address for an LP NFT |
| `getTotalTokensDeployed()` | Total tokens ever launched |
| `getTrustedForwarder()` | Current Gelato ERC-2771 forwarder address |

---

## Contract Addresses

| Contract | Address |
|---|---|
| **SentryAgentLaunchFactory (Proxy)** | `0x733733E8eAbB94832847AbF0E0EeD6031c3EB2E4` |
| **Implementation (V3)** | `0x4b48bEAbAdb7e414A225Aeed7ACB8a9209B4800f` |
| **ProxyAdmin** | `0x52D15931D109DcfAbe8C21b0E279dC6b3Dea7002` |

Deployed on Ink (Chain ID 57073).
