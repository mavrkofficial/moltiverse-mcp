# ERC-20 & Native ETH — Agent Skills

## Check Balance

```
erc20_balance(token=<address>, owner=<wallet>)
→ { balance, decimals, symbol, formatted }

// Native ETH:
erc20_balance(token="0x0000000000000000000000000000000000000000", owner=<wallet>)
→ { balance, decimals: 18, symbol: "ETH", formatted }
```

**Always check decimals.** USDC/USDT0 = 6. WETH/most = 18. kBTC = 8.

## Transfer

```
erc20_transfer(token=<address>, to=<recipient>, amount=<wei>)

// Native ETH:
erc20_transfer(token="0x0000000000000000000000000000000000000000", to=<recipient>, amount=<wei>)
```

## Approve

Most protocols (Tydro, Tsunami, Citadel) auto-approve. Use manual approve only when needed.

```
erc20_approve(token=<address>, spender=<contract>, amount=<wei>)
erc20_approve(token=<address>, spender=<contract>, amount="max")   // unlimited
```

## Decimals Reference

| Token | Decimals | 1 token in wei |
|---|---|---|
| ETH / WETH | 18 | 1000000000000000000 |
| USDC / USDT0 | 6 | 1000000 |
| kBTC | 8 | 100000000 |
| NAMI / SENTRY / MOLTING | 18 | 1000000000000000000 |
