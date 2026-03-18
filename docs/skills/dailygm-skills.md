# DailyGM — Agent Skills

DailyGM is an on-chain "Good Morning" protocol on Ink. Say GM, send a GM to someone, or check when someone last said GM — all recorded on the blockchain.

## Say GM

```
dailygm_gm()
→ hash, status, "GM! Recorded on-chain."
```

One GM per wallet per 24 hours. Reverts if you already GMed today.

## Say GM to Someone

```
dailygm_gm_to(recipient="0x1234...")
→ hash, status, "GM sent to 0x1234...!"
```

Same 24-hour cooldown. Cannot GM yourself — will revert.

## Check Last GM

```
dailygm_last_gm(user="0x1234...")
→ lastGmTimestamp, lastGmDate, neverGmed, canGmAgain, secondsUntilNextGm
```

Returns when the user last GMed and whether they can GM again.

## Daily GM Flow

```
1. dailygm_last_gm(user=<your_wallet>)   → check if you can GM
2. dailygm_gm()                           → say GM (if canGmAgain is true)
   — or —
   dailygm_gm_to(recipient=<friend>)      → GM a friend
```

## Key Facts

- **Once per 24 hours** — the contract enforces a strict daily limit
- **Cannot GM yourself** — `gmTo` reverts if recipient == sender
- **On-chain forever** — every GM is an immutable transaction on Ink
- Contract: `0x9F500d075118272B3564ac6Ef2c70a9067Fd2d3F`
