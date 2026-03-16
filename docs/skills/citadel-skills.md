# Citadel LP Locker — Agent Skills

Citadel locks Tsunami V3 LP NFTs for a specified duration, with optional Tydro yield routing.

## Locking an LP Position

```
1. citadel_lock_lp(tokenId=<nftId>, duration=<seconds>)
   → txHash

   Common durations:
   7 days   = 604800
   30 days  = 2592000
   365 days = 31536000
```

## Checking and Unlocking

```
citadel_is_locked(tokenId)       → true/false
citadel_is_unlockable(tokenId)   → true/false (period expired?)
citadel_get_lock_info(tokenId)   → { owner, unlockTime }

citadel_unlock(tokenId)          → txHash  // only after is_unlockable = true
```

## Collecting Fees (Without Unlocking)

```
citadel_collect_fees(tokenId)    → { amount0, amount1, txHash }
```

## Route Fees to Tydro for Extra Yield

```
citadel_supply_tydro(tokenId, asset="WETH")  → txHash
```

## View Your Locks

```
citadel_get_locker_nfts(address=<your_address>)  → [tokenId, ...]
citadel_get_stats()                               → { totalLocked, sentryLocks }
```
