# NADO Perps DEX

## Overview

NADO is a high-performance central-limit orderbook (CLOB) DEX on Ink offering spot and perpetual futures trading with up to 20x leverage, 5-15ms latency, and fees as low as 1.5 bps. It runs the Vertex Protocol engine — an off-chain sequencer with on-chain settlement.

Read operations (market data, account queries) use the Archive API directly. Write operations (placing/cancelling orders) go through the Gateway API using EIP-712 signed payloads with `EVM_PRIVATE_KEY`.

---

## API Endpoints (Mainnet)

| Endpoint | Purpose |
|---|---|
| `https://archive.prod.nado.xyz/v1` | Read queries (POST with typed body) |
| `https://gateway.prod.nado.xyz/v1/execute` | Order execution (POST, requires EIP-712 signature) |

---

## Contracts (Ink Mainnet)

| Contract | Address |
|---|---|
| Endpoint | `0x05ec92D78ED421f3D3Ada77FFdE167106565974E` |
| Clearinghouse | `0xD218103918C19D0A10cf35300E4CfAfbD444c5fE` |
| SpotEngine | `0xFcD94770B95fd9Cc67143132BB172EB17A0907fE` |
| PerpEngine | `0xF8599D58d1137fC56EcDd9C16ee139C8BDf96da1` |
| Quote (USDT0) | `0x0200C29006150606B650577BBE7B6248F58470c1` |

---

## Markets

NADO uses integer product IDs. Spot markets have even IDs, perp markets have odd IDs (Vertex convention).

| Symbol | Product ID | Type |
|---|---|---|
| USDT0 | 0 | spot |
| kBTC | 1 | spot |
| BTC-PERP | 2 | perp |
| ETH | 3 | spot |
| ETH-PERP | 4 | perp |
| USDC | 5 | spot |
| SOL-PERP | 8 | perp |
| ARB-PERP | 10 | perp |
| AVAX-PERP | 14 | perp |
| LINK-PERP | 16 | perp |
| TIA-PERP | 18 | perp |
| BNB-PERP | 26 | perp |
| MKR-PERP | 28 | perp |
| SUI-PERP | 32 | perp |
| INJ-PERP | 34 | perp |

Use `nado_get_markets` to get the full live list with current prices.

Markets can be specified by symbol (e.g. `"BTC-PERP"`, `"ETH-PERP"`) or product ID.

---

## Subaccounts

Each wallet can have multiple named subaccounts. The default subaccount name is `"default"`. Subaccounts are encoded as a 32-byte hex value: `address (20 bytes) + name (12 bytes, right-padded ASCII)`.

Most tools default to the `"default"` subaccount and accept an optional `subaccountName` parameter.

---

## Tools

### `nado_get_markets`

List all NADO markets with current oracle/mark prices and product IDs.

```
nado_get_markets()
-> { markets: [{ symbol, productId, type, indexPrice, markPrice }] }
```

No parameters required.

---

### `nado_get_market_price`

Get detailed price data and funding rate for a market.

```
nado_get_market_price({ market: "BTC-PERP" })
-> {
     indexPrice: "73721.8505",
     markPrice: "73712.4162",
     basis: "-0.0128%",
     fundingRate8h: "0.0012%",
     fundingRateAnnualized: "1.32%"
   }
```

| Parameter | Required | Description |
|---|---|---|
| `market` | Yes | Market symbol or product ID |

---

### `nado_get_candlesticks`

Get OHLCV candlestick data.

```
nado_get_candlesticks({ market: "ETH-PERP", granularity: 3600, limit: 24 })
-> { candles: [{ timestamp, open, high, low, close, volume }] }
```

| Parameter | Required | Description |
|---|---|---|
| `market` | Yes | Market symbol or product ID |
| `granularity` | No | Candle size in seconds — `60`, `300`, `900`, `3600`, `86400` (default: `3600`) |
| `limit` | No | Number of candles, max 100 (default: 20) |

---

### `nado_get_funding_rate`

Get current and historical funding rates for a perp market.

```
nado_get_funding_rate({ market: "BTC-PERP" })
-> {
     fundingRate8h: "0.0012%",
     fundingRateAnnualized: "1.32%",
     lastUpdated: "2025-01-01T12:00:00.000Z"
   }
```

---

### `nado_get_account`

Get a wallet's NADO account: spot balances and perp positions summary.

```
nado_get_account({ address?: "0x...", subaccountName?: "default" })
-> { address, subaccount, balances: [...] }
```

| Parameter | Required | Description |
|---|---|---|
| `address` | No | Wallet address (defaults to `EVM_PRIVATE_KEY` address) |
| `subaccountName` | No | Subaccount name (default: `"default"`) |

---

### `nado_get_positions`

Get open perpetual positions for a wallet.

```
nado_get_positions({ address?: "0x..." })
-> {
     positions: [{
       market: "BTC-PERP",
       side: "long",
       size: "0.500000",
       vQuoteBalance: "-36800.0000"
     }]
   }
```

---

### `nado_get_open_orders`

Get open resting orders for a wallet.

```
nado_get_open_orders({ address?: "0x...", markets?: ["BTC-PERP"] })
-> {
     orders: [{
       market: "BTC-PERP",
       digest: "0x...",
       side: "buy",
       price: "70000.0000",
       amount: "0.100000",
       expiration: "2025-01-01T13:00:00.000Z"
     }]
   }
```

| Parameter | Required | Description |
|---|---|---|
| `address` | No | Wallet address |
| `markets` | No | Filter to specific markets |
| `subaccountName` | No | Subaccount name |

---

### `nado_get_trade_history`

Get recent fill history for a wallet.

```
nado_get_trade_history({ address?: "0x...", market?: "ETH-PERP", limit?: 20 })
-> {
     trades: [{
       market: "ETH-PERP",
       side: "buy",
       size: "1.000000",
       price: "2256.0000",
       quoteValue: "2256.0000",
       fee: "0.003384"
     }]
   }
```

---

### `nado_place_order`

Place a limit or market order. Orders are signed with EIP-712 and submitted to the Gateway.

```
nado_place_order({
  market: "ETH-PERP",
  amount: 1.0,       // positive = buy/long
  price: 2250.0,     // use 0 for market (IOC)
  timeInForce: "GTC"
})
-> { market, side, amount, price, tif, result }
```

| Parameter | Required | Description |
|---|---|---|
| `market` | Yes | Market symbol |
| `amount` | Yes | Size in base asset — positive = buy/long, negative = sell/short |
| `price` | Yes | Limit price in USD. Use `0` for market order (auto-sets IOC) |
| `timeInForce` | No | `GTC` (default), `IOC`, or `FOK` |
| `subaccountName` | No | Subaccount name |

Requires `EVM_PRIVATE_KEY`. Orders are signed locally — private key never leaves the agent.

---

### `nado_cancel_order`

Cancel a specific order by its digest.

```
nado_cancel_order({ market: "ETH-PERP", digest: "0x..." })
```

| Parameter | Required | Description |
|---|---|---|
| `market` | Yes | Market symbol |
| `digest` | Yes | Order digest from `nado_get_open_orders` |

Requires `EVM_PRIVATE_KEY`.

---

### `nado_cancel_all`

Cancel all open orders for a market.

```
nado_cancel_all({ market: "BTC-PERP" })
```

Requires `EVM_PRIVATE_KEY`.

---

## Common Use Cases

### Check market before trading

```
1. nado_get_market_price({ market: "ETH-PERP" })
2. nado_get_candlesticks({ market: "ETH-PERP", granularity: 3600, limit: 24 })
3. nado_get_funding_rate({ market: "ETH-PERP" })
```

### Open a long position

```
1. nado_get_account()                            // check available margin
2. nado_place_order({ market: "ETH-PERP", amount: 1.0, price: 2250, timeInForce: "GTC" })
3. nado_get_positions()                          // confirm position
```

### Market sell (close position immediately)

```
nado_place_order({ market: "ETH-PERP", amount: -1.0, price: 0, timeInForce: "IOC" })
```

### Cancel and re-enter at better price

```
1. nado_get_open_orders({ markets: ["ETH-PERP"] })
2. nado_cancel_order({ market: "ETH-PERP", digest: "0x..." })
3. nado_place_order({ market: "ETH-PERP", amount: 1.0, price: 2200, timeInForce: "GTC" })
```

---

## Notes

- All prices use x18 fixed-point internally (18-decimal); the tools return human-readable strings
- Funding is paid/received every 8 hours; positive rate = longs pay shorts
- The Gateway API requires a real non-restricted IP — read queries via Archive work from anywhere
- Order digests are keccak256 hashes of the signed order and are used for cancellation
- `EVM_PRIVATE_KEY` is used only for local EIP-712 signing and is never transmitted
