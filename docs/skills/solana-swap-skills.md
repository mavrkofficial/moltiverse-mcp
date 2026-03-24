# Solana Swap — Skills (Orca Whirlpool + Jupiter)

## Get Pool Info

Call `solana_orca_pool_info` with `token_a` and `token_b` mint addresses. Returns the pool address, current price, liquidity, tick, fee rate, and vault addresses. Use tick spacing `128` (default) for 1% fee tier pools.

## Get a Swap Quote

Call `solana_orca_quote` with `pool` address, `input_mint`, and `amount` (in raw lamports/smallest unit). Returns an estimated output amount. This is read-only.

## Execute a Swap

Call `solana_orca_swap` with `pool`, `input_mint`, `amount`, and optional `slippage_bps` (default 100 = 1%). Requires `SOL_PRIVATE_KEY` env var.

Use `So11111111111111111111111111111111111111112` as `input_mint` to swap SOL for a token.

**After swap, report:** direction, amount, tx signature, Solscan link.

## Dev Buy After Launch

After deploying a token via `solana_sentry_agent_launch`, use the returned `whirlpool` address to buy your own token:

1. Call `solana_orca_swap` with `pool` = the whirlpool from launch, `input_mint` = WSOL mint, `amount` = desired SOL in lamports

---

## Jupiter (Alternative Swap Path)

For tokens with established liquidity, [Jupiter](https://jup.ag) is the easiest swap path — it aggregates across all Solana DEXes (including Orca) and handles routing automatically. Two HTTP calls, no PDAs, no account ordering.

Install Jupiter's official agent skills for full API coverage (Ultra Swap, token search, pricing, perps, DCA, lending, and more):

```
npx skills add jup-ag/agent-skills --skill "integrating-jupiter"
```

Full reference: https://dev.jup.ag/ai/skills

**Note:** Jupiter needs time to index new pools. For freshly launched tokens (e.g. right after `solana_sentry_agent_launch`), use `solana_orca_swap` to hit the pool directly — Jupiter may not have indexed it yet.
