# Solana Swap — Skills (Orca Whirlpool + Jupiter)

## Buying a Token by Mint Address

When given a token mint address to buy on Solana, follow this flow:

### Step 1 — Find the pool

Call `solana_sentry_lookup` with the token `mint` address. If the token was deployed through the Sentry Launch Factory, this returns the `whirlpool` (pool address), creator, name, symbol, and whether it was an agent launch.

If the lookup returns a result, use the `whirlpool` address as the pool. All Sentry-deployed tokens are paired with **WSOL** (`So11111111111111111111111111111111111111112`) on Orca.

If `solana_sentry_lookup` returns nothing (token wasn't deployed via Sentry), fall back to Jupiter (see below).

### Step 2 — Execute the swap

Call `solana_orca_swap` with:
- `pool` = the `whirlpool` address from the lookup
- `input_mint` = `So11111111111111111111111111111111111111112` (WSOL — to buy the token with SOL)
- `amount` = SOL amount in **lamports** (1 SOL = 1,000,000,000 lamports, so 0.75 SOL = `750000000`)
- `slippage_bps` = optional, default 100 (1%)

Requires `SOL_PRIVATE_KEY` (env var or OS keychain via `moltiverse-mcp-setup`).

To **sell** the token back to SOL, use the token's mint address as `input_mint` instead.

### Step 3 — Report

After a successful swap, report:
- Direction (bought/sold), token name and symbol
- Amount of SOL spent or received
- Transaction signature
- Solscan link: `https://solscan.io/tx/{signature}`

## Quick Reference

| Action | input_mint | You get |
|--------|-----------|---------|
| Buy token with SOL | `So11111111111111111111111111111111111111112` | The token |
| Sell token for SOL | The token's mint address | SOL |

**SOL to lamports**: multiply by 1,000,000,000. Examples:
- 0.01 SOL = `10000000`
- 0.05 SOL = `50000000`
- 0.1 SOL = `100000000`
- 0.5 SOL = `500000000`
- 1 SOL = `1000000000`

## Get a Swap Quote (Optional)

Call `solana_orca_quote` with `pool`, `input_mint`, and `amount` to estimate the output before swapping. This is read-only and doesn't require a private key.

## Get Pool Details

Call `solana_orca_pool_info` with `token_a` and `token_b` mint addresses. Returns the pool address, current price, liquidity, tick, fee rate, and vault addresses. Use tick spacing `128` (default) for 1% fee tier pools.

## Dev Buy After Launch

After deploying a token via `solana_sentry_agent_launch`, use the returned `whirlpool` address to immediately buy your own token:

```
solana_orca_swap(
  pool = <whirlpool from launch response>,
  input_mint = "So11111111111111111111111111111111111111112",
  amount = <SOL in lamports>
)
```

No lookup needed — the whirlpool address is in the launch response.

## List All Sentry Factory Tokens

Call `solana_sentry_list` to see every token deployed through the factory. Filter by `creator` or set `agent_only: true` to see only agent-launched tokens. Each result includes the `whirlpool` address for swapping.

---

## Jupiter (Fallback / Non-Sentry Tokens)

For tokens **not** deployed through the Sentry Launch Factory, or tokens with liquidity across multiple DEXes, use [Jupiter](https://jup.ag) — it aggregates across all Solana DEXes and handles routing automatically.

Install Jupiter's official agent skills for full API coverage (Ultra Swap, token search, pricing, perps, DCA, lending, and more):

```
npx skills add jup-ag/agent-skills --skill "integrating-jupiter"
```

Full reference: https://dev.jup.ag/ai/skills

**Important:** Jupiter needs time to index new pools. For freshly launched tokens (right after `solana_sentry_agent_launch`), always use `solana_orca_swap` to hit the Orca pool directly — Jupiter may not have indexed it yet.

---

## Solana Development Reference

For general Solana development skills (Anchor programs, testing, security, common errors, version compatibility):

```
npx skills add https://github.com/solana-foundation/solana-dev-skill
```

For Helius Build skills (DAS for NFT/asset reads, Sender for reliable transaction landing with dynamic priority fees, WebSockets):

```
npx skills add helius-labs/core-ai --skill build
```
