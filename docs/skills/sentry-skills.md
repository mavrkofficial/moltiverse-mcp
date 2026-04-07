# Sentry Launch Factory — Agent Skills

Sentry deploys a fully tradable ERC-20 token in a single transaction — no seed capital required.

## Two Launch Paths

| Tool | Access | When to use |
|---|---|---|
| `sentry_launch` | **Permissionless** | Anyone — no prerequisites |
| `sentry_launch_agent` | **Agent-gated** | Requires ERC-8004 identity NFT |

## Permissionless Launch

No identity required. Open to any wallet.

```
1. sentry_get_supported_base_tokens()
   → [{ address, symbol }]   // Check what's available first

2. sentry_launch(name="My Token", symbol="MTK", baseToken=<WETH_address>)
   → tokenAddress, poolAddress, nftTokenId, txHash
```

## Agent Launch (ERC-8004 Required)

Your wallet must hold an identity NFT before calling `sentry_launch_agent()`. Without one, the transaction reverts.

```
1. identity_check_registered()   → check if already registered
2. identity_register(name="my-agent", description="What my agent does")
   → agentId, hash          // One-time registration (see identity-skills.md)

3. sentry_get_supported_base_tokens()
   → [{ address, symbol }]

4. sentry_launch_agent(name="My Token", symbol="MTK", baseToken=<WETH_address>)
   → tokenAddress, poolAddress, nftTokenId, txHash
```

## What Happens Atomically (Both Paths)

1. New ERC-20 deployed (1 billion fixed supply, ownership renounced to 0xdead)
2. Tsunami V3 pool created at 1% fee tier
3. Single-sided LP minted (100% of token supply deposited, no ETH needed)
4. LP NFT locked in Citadel — **can never be withdrawn**

Agent launches additionally flag the position via `isAgentPosition`, which determines fee routing.

## Tracking Your Launches

```
sentry_get_creator_nfts(creator=<your_address>)  → [tokenId, ...]
sentry_get_token_by_nft(tokenId)                 → tokenAddress
sentry_get_total_deployed()                       → totalCount
```

## Fee Collection (Owner Only)

```
sentry_collect_fees(tokenIds=[...])
```

Fee routing depends on launch type:
- **Meme token fees** → treasury (both paths)
- **WETH fees** → `feesWalletRegular` (permissionless) or `feesWalletAgent` (agent launches)

## Key Constraints

- LP is **permanently locked** in Citadel — no unlock mechanism exists
- Token supply fixed at 1 billion — no minting or burning
- Fee collection is **owner-only** — fees route to treasury and stakeholder wallets, not token creators
- Pool always uses 1% fee tier (tick spacing 200)
- Agent launches require ERC-8004 identity — register before launching
