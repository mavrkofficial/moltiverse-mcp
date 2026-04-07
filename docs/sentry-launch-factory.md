# Sentry Launch Factory

## Overview

The Sentry Launch Factory is a unified token launchpad contract deployed on Ink that enables anyone — or specifically AI agents holding an ERC-8004 identity — to deploy a fully tradable ERC-20 token in a single transaction. It is the most capital-efficient way to create a low-cap token with immediate on-chain liquidity: no seed capital required, no manual pool setup, no multi-step process.

The factory exposes two launch paths:

| Function | Access | Description |
|---|---|---|
| `launch(name, symbol, baseToken)` | **Permissionless** | Anyone can launch a token |
| `launchAgent(name, symbol, baseToken)` | **Agent-gated** | Requires the caller to hold an ERC-8004 identity NFT |

Both paths perform the same atomic sequence:

1. Deploy a new ERC-20 token contract (1 billion fixed supply, ownership renounced)
2. Create a Tsunami V3 concentrated liquidity pool at the 1% fee tier
3. Mint a single-sided LP position (100% token supply, no base token required)
4. Lock the LP NFT in Citadel (permanent lock — no unlock mechanism)
5. Emit indexable events for frontends and analytics

The entire launch happens in one transaction. The resulting token is immediately tradable on Tsunami V3 with permanently locked liquidity.

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

## Launch Paths

### Permissionless Launch (`launch`)

Open to any wallet. No prerequisites.

```
sentry_launch(name="My Token", symbol="MTK", baseToken=<WETH_address>)
```

### Agent Launch (`launchAgent`)

Requires the caller to hold an ERC-8004 identity NFT. Register first via `identity_register()`.

```
sentry_launch_agent(name="My Token", symbol="MTK", baseToken=<WETH_address>)
```

The factory checks the `identityRegistry` to verify the caller owns at least one identity NFT. If not, the transaction reverts.

Agent-launched positions are flagged via `isAgentPosition[tokenId] = true`, which determines fee routing (see below).

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

The factory mints a single-sided concentrated liquidity position. The LP NFT is then locked in Citadel — the factory's integrated LP locker. There is no unlock mechanism.

If the Citadel lock fails, the factory emits a `CitadelLockFailed` event and the LP NFT remains in the factory. An admin can retry the lock via `retryLockInCitadel(tokenId)`.

### Step 5: Creator Tracking

The factory records every launch:

- `nftCreators[tokenId] → creator address`
- `creatorNFTs[creator] → tokenId[]`
- `tokenIdToToken[tokenId] → token address`
- `isAgentPosition[tokenId] → bool` (true only for `launchAgent` calls)

---

## Fee Collection & Routing

All trading fees from Sentry-launched pools accrue to the locked LP positions. **Only the factory owner can collect fees.**

When fees are collected, the factory routes them based on the launch type:

| Fee Type | Regular Launch (`launch`) | Agent Launch (`launchAgent`) |
|---|---|---|
| **Meme token fees** | Sent to treasury | Sent to treasury |
| **WETH fees** | Sent to `feesWalletRegular` | Sent to `feesWalletAgent` |

```
collectFees(tokenId)              — collect fees from one LP position
collectMultipleFees(tokenIds[])   — batch collect from multiple positions
```

The treasury and fee wallet addresses are updatable by the factory owner:
- `updateTreasury(newTreasury)`
- `setFeeWallets(regularWallet, agentWallet)`

### Current Fee Wallets

| Wallet | Address |
|---|---|
| `feesWalletRegular` | `0xEf687f8c52229754a5780B5c5d746CD048B81E57` |
| `feesWalletAgent` | `0xe8360F88D529283bB6E759D6Aa74e3A25aae26Ca` |
| `treasury` | `0xcaAfCf8E55f3B5e3D5F7957987db232f08d2367c` |

---

## Upgradeable Architecture

The factory is deployed behind a `TransparentUpgradeableProxy` with a `ProxyAdmin`:

- Logic can be upgraded without changing the contract address
- All state (creator mappings, NFT custody, configuration) is preserved across upgrades
- `initialize()` replaces the constructor and can only be called once
- `__gap` reserves storage slots for future state variables

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
| `LPLocked(tokenId, pool, token)` | LP NFT locked in Citadel |
| `FeesCollected(tokenId, amount0, amount1)` | Trading fees harvested |
| `CitadelLockFailed(tokenId, reason)` | Citadel lock attempt failed (LP stays in factory) |
| `FeeWalletsUpdated(oldRegular, newRegular, oldAgent, newAgent)` | Fee routing wallets changed |
| `IdentityRegistryUpdated(oldRegistry, newRegistry)` | Identity registry reference changed |
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
| `isAgentPosition(tokenId)` | Whether a position was created via `launchAgent` |
| `feesWalletRegular()` | WETH fee destination for regular launches |
| `feesWalletAgent()` | WETH fee destination for agent launches |
| `identityRegistry()` | ERC-8004 identity registry address |

---

## Contract Addresses

| Contract | Address |
|---|---|
| **SentryLaunchFactory (Proxy)** | `0xDc37e11B68052d1539fa23386eE58Ac444bf5BE1` |
| **Implementation** | `0x6f269786695Fcd8cc684ebF37604dd2fB1797FcC` |
| **ProxyAdmin** | `0x6dc3fc5C00e8c807207EBAD35706b6b2520cA757` |

Deployed on Ink (Chain ID 57073).
