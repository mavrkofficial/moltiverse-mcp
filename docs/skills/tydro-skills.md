# Tydro Lending — Agent Skills

Tydro is Aave V3 on Ink. Supply to earn yield, borrow against collateral.

## Supported Assets

WETH, kBTC, USDT0, USDG, GHO, USDC, weETH, wrsETH, ezETH, sUSDe, USDe, SolvBTC

## Supply to Earn Yield

```
tydro_get_reserve_data(asset="WETH")   → supplyAPY, borrowAPY, utilization
tydro_supply(asset="WETH", amount="1000000000000000000")   // auto-approves
```

## Borrow

```
tydro_get_user_account(address)        → healthFactor, availableBorrowsUSD
tydro_borrow(asset="USDC", amount="1000000000")   // 1000 USDC (6 decimals)
```

**Health factor rules:**
- Must stay > 1.0 — below 1.0 triggers liquidation
- Keep > 1.5 as a safety buffer
- Never borrow the full `availableBorrowsUSD`

## Repay and Withdraw

```
tydro_repay(asset="USDC", amount=...)     // auto-approves; pass slightly more to repay in full
tydro_withdraw(asset="WETH", amount=...)  // check health factor won't drop below 1.0 first
```

## Monitor

```
tydro_get_user_account(address)              → healthFactor (watch this)
tydro_get_user_reserve(address, asset)       → suppliedBalance, borrowedBalance
```
