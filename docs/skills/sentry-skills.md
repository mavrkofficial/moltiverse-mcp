# Sentry Agent Launch Factory — Agent Skills

Sentry deploys a fully tradable ERC-20 token in a single transaction — no seed capital required.

## Launching a Token

```
1. sentry_get_supported_base_tokens()
   → [{ address, symbol }]   // Check what's available first

2. sentry_launch(name="My Token", symbol="MTK", baseToken=<WETH_address>)
   → tokenAddress, poolAddress, nftTokenId, txHash
```

**What happens atomically:**
1. New ERC-20 deployed (1 billion fixed supply, ownership renounced to 0xdead)
2. Tsunami V3 pool created at 1% fee tier
3. Single-sided LP minted (100% of token supply deposited, no ETH needed)
4. LP NFT permanently held by the factory — **can never be withdrawn**

## Tracking Your Launches

```
sentry_get_creator_nfts(creator=<your_address>)  → [tokenId, ...]
sentry_get_token_by_nft(tokenId)                 → tokenAddress
sentry_get_total_deployed()                       → totalCount
```

## Key Constraints

- LP is **permanently locked** — no unlock mechanism exists
- Token supply fixed at 1 billion — no minting or burning
- Fee collection is **owner-only** → sent to treasury, not token creators
- Pool always uses 1% fee tier (tick spacing 200)
