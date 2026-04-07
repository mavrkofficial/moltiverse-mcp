// NADO Perps DEX — Vertex Protocol engine on Ink (chainId 57073)
// Archive API (read): https://archive.prod.nado.xyz/v1  — POST with typed query body
// Gateway API (write): https://gateway.prod.nado.xyz/v1 — POST /execute with EIP-712 signed payloads

import { type Address, encodePacked, keccak256, toHex, hexToBytes, encodeAbiParameters, parseAbiParameters, maxUint256 } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { signTypedData } from 'viem/accounts';
import { publicClient, getAccount, getWalletClient } from '../client.js';
import { getPrivateKey } from '../keychain.js';

// ── Constants ────────────────────────────────────────────────────────
const ARCHIVE  = 'https://archive.prod.nado.xyz/v1';
const GATEWAY  = 'https://gateway.prod.nado.xyz/v1';
const CHAIN_ID = 57073;

// Contract addresses on Ink mainnet
const ENDPOINT = '0x05ec92D78ED421f3D3Ada77FFdE167106565974E';

// Spot token addresses on Ink for NADO collateral deposits
const SPOT_TOKENS: Record<number, { address: Address; decimals: number; symbol: string }> = {
  0:  { address: '0x0200C29006150606B650577BBE7B6248F58470c1', decimals: 6,  symbol: 'USDT0'  },
  1:  { address: '0x73e0c0d45e048d25fc26fa3159b0aa04bfa4db98', decimals: 8,  symbol: 'kBTC'   },
  3:  { address: '0x4200000000000000000000000000000000000006', decimals: 18, symbol: 'WETH'   },
  5:  { address: '0x2d270e6886d130d724215a266106e6832161eaed', decimals: 6,  symbol: 'USDC'   },
  11: { address: '0xae4efbc7736f963982aacb17efa37fcbab924cb3', decimals: 18, symbol: 'SolvBTC'},
};

const ENDPOINT_ABI = [
  {
    name: 'depositCollateral',
    type: 'function',
    inputs: [
      { name: 'subaccountName', type: 'bytes12' },
      { name: 'productId', type: 'uint32' },
      { name: 'amount', type: 'uint128' },
    ],
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    name: 'submitSlowModeTransaction',
    type: 'function',
    inputs: [
      { name: 'transaction', type: 'bytes' },
    ],
    outputs: [],
    stateMutability: 'nonpayable',
  },
] as const;

const ERC20_APPROVE_ABI = [{
  name: 'approve', type: 'function',
  inputs: [{ name: 'spender', type: 'address' }, { name: 'amount', type: 'uint256' }],
  outputs: [{ name: '', type: 'bool' }], stateMutability: 'nonpayable',
}] as const;

// Encode subaccount name as bytes12 (for depositCollateral / withdrawCollateral)
function encodeSubaccountName(name: string): `0x${string}` {
  const buf = Buffer.alloc(12);
  Buffer.from(name, 'ascii').copy(buf, 0, 0, Math.min(12, name.length));
  return `0x${buf.toString('hex')}` as `0x${string}`;
}

// Product ID registry (even = spot, odd perp pairs; perp IDs are even+1 per Vertex convention)
const MARKETS: Record<string, { productId: number; type: 'spot' | 'perp' }> = {
  'USDT0':    { productId: 0,  type: 'spot' },
  'kBTC':     { productId: 1,  type: 'spot' },
  'BTC-PERP': { productId: 2,  type: 'perp' },
  'ETH':      { productId: 3,  type: 'spot' },
  'ETH-PERP': { productId: 4,  type: 'perp' },
  'USDC':     { productId: 5,  type: 'spot' },
  'SOL-PERP': { productId: 8,  type: 'perp' },
  'ARB-PERP': { productId: 10, type: 'perp' },
  'SolvBTC':  { productId: 11, type: 'spot' },
  'AVAX-PERP':{ productId: 14, type: 'perp' },
  'LINK-PERP':{ productId: 16, type: 'perp' },
  'TIA-PERP': { productId: 18, type: 'perp' },
  'DOGE-PERP':{ productId: 20, type: 'perp' },
  'SEI-PERP': { productId: 22, type: 'perp' },
  'OP-PERP':  { productId: 24, type: 'perp' },
  'BNB-PERP': { productId: 26, type: 'perp' },
  'MKR-PERP': { productId: 28, type: 'perp' },
  'PEPE-PERP':{ productId: 30, type: 'perp' },
  'SUI-PERP': { productId: 32, type: 'perp' },
  'INJ-PERP': { productId: 34, type: 'perp' },
  'WLD-PERP': { productId: 36, type: 'perp' },
  'BLUR-PERP':{ productId: 38, type: 'perp' },
  'APT-PERP': { productId: 40, type: 'perp' },
  'COMP-PERP':{ productId: 42, type: 'perp' },
  'JTO-PERP': { productId: 44, type: 'perp' },
  'PYTH-PERP':{ productId: 46, type: 'perp' },
  'TRX-PERP': { productId: 48, type: 'perp' },
  'NEAR-PERP':{ productId: 50, type: 'perp' },
  'FTM-PERP': { productId: 52, type: 'perp' },
  'ATOM-PERP':{ productId: 54, type: 'perp' },
  'MEME-PERP':{ productId: 56, type: 'perp' },
  'XRP-PERP': { productId: 58, type: 'perp' },
  'MATIC-PERP':{ productId: 60, type: 'perp' },
  'ENA-PERP': { productId: 62, type: 'perp' },
  'FET-PERP': { productId: 64, type: 'perp' },
  'JUP-PERP': { productId: 66, type: 'perp' },
  'STX-PERP': { productId: 68, type: 'perp' },
  'AAVE-PERP':{ productId: 70, type: 'perp' },
  'WIF-PERP': { productId: 72, type: 'perp' },
  'W-PERP':   { productId: 74, type: 'perp' },
  'ZRO-PERP': { productId: 76, type: 'perp' },
  'TAO-PERP': { productId: 78, type: 'perp' },
  'ZK-PERP':  { productId: 80, type: 'perp' },
  'POPCAT-PERP':{ productId: 82, type: 'perp' },
  'RENDER-PERP':{ productId: 84, type: 'perp' },
  'EIGEN-PERP':{ productId: 86, type: 'perp' },
};

function resolveMarket(name: string): { productId: number; type: 'spot' | 'perp' } {
  const upper = name.toUpperCase();
  const m = MARKETS[upper] ?? MARKETS[upper + '-PERP'];
  if (m) return m;
  const byId = Object.values(MARKETS).find(v => v.productId === parseInt(name));
  if (byId) return byId;
  throw new Error(`Unknown market: ${name}. Examples: BTC-PERP, ETH-PERP, ETH, SOL-PERP`);
}

// ── Subaccount helpers ────────────────────────────────────────────────
// Vertex subaccount = address (20 bytes) + name (12 bytes, right-padded ASCII)
function encodeSubaccount(address: string, name = 'default'): string {
  const addrHex = address.toLowerCase().replace('0x', '');
  const nameBytes = Buffer.from(name, 'ascii');
  const namePadded = Buffer.alloc(12);
  nameBytes.copy(namePadded, 0, 0, Math.min(12, nameBytes.length));
  return '0x' + addrHex + namePadded.toString('hex');
}

function decodeSubaccount(sub: string): { address: string; name: string } {
  const hex = sub.replace('0x', '');
  const address = '0x' + hex.slice(0, 40);
  const nameHex = hex.slice(40);
  const name = Buffer.from(nameHex, 'hex').toString('ascii').replace(/\0/g, '');
  return { address, name };
}

// ── x18 formatting (18 decimal fixed point) ───────────────────────────
function fromX18(val: string | number | bigint): number {
  return Number(BigInt(val.toString())) / 1e18;
}

function toX18(val: number): bigint {
  return BigInt(Math.round(val * 1e18));
}

// ── Archive API helper ─────────────────────────────────────────────────
async function archiveQuery(body: Record<string, unknown>): Promise<unknown> {
  const res = await fetch(ARCHIVE, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Accept-Encoding': 'gzip, deflate, br', 'Accept': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`NADO archive error ${res.status}: ${text.slice(0, 300)}`);
  }
  return res.json();
}

// ── Gateway execute helper (IP-blocked in Claude env, works from agents) ──
async function gatewayExecute(body: Record<string, unknown>): Promise<unknown> {
  const res = await fetch(`${GATEWAY}/execute`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Accept-Encoding': 'gzip, deflate, br', 'Accept': 'application/json' },
    body: JSON.stringify(body),
  });
  const json = await res.json() as Record<string, unknown>;
  if (!res.ok || json?.status === 'failure') {
    throw new Error(`NADO gateway error: ${json?.error ?? JSON.stringify(json).slice(0, 400)}`);
  }
  return json;
}

// ── EIP-712 order signing ─────────────────────────────────────────────
// NADO nonce encodes recv_time: (recvTimeMillis << 20) + randomInt
// recv_time = deadline by which the sequencer must receive the order (default: now + 90s)
function getOrderNonce(recvTimeMillis: number = Date.now() + 90_000): bigint {
  const randomInt = Math.floor(Math.random() * 1000);
  return (BigInt(recvTimeMillis) << 20n) + BigInt(randomInt);
}

// NADO order verifyingContract = address(uint160(productId))
function getOrderVerifyingAddress(productId: number): Address {
  return toHex(productId, { size: 20 }) as Address;
}

// Pack appendix bitfield (uint128):
// | value(64) | builderId(16) | builderFeeRate(10) | reserved(24) | trigger(2) | reduceOnly(1) | orderType(2) | isolated(1) | version(8) |
// orderType: 0=default/GTC, 1=IOC, 2=FOK, 3=post_only
function packOrderAppendix(orderType: number): bigint {
  let packed = 0n;                             // value (64 bits)
  packed = (packed << 16n) | 0n;               // builderId
  packed = (packed << 10n) | 0n;               // builderFeeRate
  packed = (packed << 24n) | 0n;               // reserved
  packed = (packed << 2n)  | 0n;               // trigger
  packed = (packed << 1n)  | 0n;               // reduceOnly
  packed = (packed << 2n)  | BigInt(orderType); // orderType
  packed = (packed << 1n)  | 0n;               // isolated
  packed = (packed << 8n)  | 1n;               // version = 1
  return packed;
}

async function signOrder(params: {
  productId: number;
  price: number;
  amount: number;          // positive = buy, negative = sell
  expiration: bigint;      // plain timestamp in seconds (no TIF flags — TIF is in appendix)
  orderType: number;       // 0=GTC, 1=IOC, 2=FOK
  subaccount: string;      // 32-byte hex subaccount
  privateKey: string;
}): Promise<{ order: Record<string, string>; signature: string }> {
  const expiration = params.expiration;
  const nonce = getOrderNonce();
  const priceX18 = toX18(params.price);
  const amountX18 = toX18(params.amount);
  const appendix = packOrderAppendix(params.orderType);

  const order = {
    sender: params.subaccount as `0x${string}`,
    priceX18: priceX18.toString(),
    amount: amountX18.toString(),
    expiration: expiration.toString(),
    nonce: nonce.toString(),
    appendix: appendix.toString(),
  };

  // NADO EIP-712: domain name = 'Nado', verifyingContract = address(uint160(productId))
  const signature = await signTypedData({
    privateKey: params.privateKey as `0x${string}`,
    domain: {
      name: 'Nado',
      version: '0.0.1',
      chainId: CHAIN_ID,
      verifyingContract: getOrderVerifyingAddress(params.productId),
    },
    types: {
      Order: [
        { name: 'sender', type: 'bytes32' },
        { name: 'priceX18', type: 'int128' },
        { name: 'amount', type: 'int128' },
        { name: 'expiration', type: 'uint64' },
        { name: 'nonce', type: 'uint64' },
        { name: 'appendix', type: 'uint128' },
      ],
    },
    primaryType: 'Order',
    message: {
      sender: params.subaccount as `0x${string}`,
      priceX18,
      amount: amountX18,
      expiration,
      nonce,
      appendix,
    },
  });

  return { order: { ...order }, signature };
}

// ── Tool definitions ───────────────────────────────────────────────────
export const nadoTools = [
  {
    name: 'nado_get_markets',
    description: 'List all NADO markets with current oracle prices, funding rates, and open interest. NADO is a Vertex Protocol perps DEX on Ink.',
    inputSchema: { type: 'object' as const, properties: {} },
  },
  {
    name: 'nado_get_market_price',
    description: 'Get mark price, index price, and current funding rate for a NADO market.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        market: { type: 'string', description: 'Market name (e.g. BTC-PERP, ETH-PERP, SOL-PERP) or product ID' },
      },
      required: ['market'],
    },
  },
  {
    name: 'nado_get_candlesticks',
    description: 'Get OHLCV candlestick data for a NADO market.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        market: { type: 'string', description: 'Market name or product ID' },
        granularity: { type: 'number', description: 'Candle size in seconds (60, 300, 900, 3600, 86400)' },
        limit: { type: 'number', description: 'Number of candles (default 20, max 100)' },
      },
      required: ['market'],
    },
  },
  {
    name: 'nado_get_funding_rate',
    description: 'Get current and historical funding rates for a perp market on NADO.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        market: { type: 'string', description: 'Perp market name (e.g. BTC-PERP, ETH-PERP)' },
      },
      required: ['market'],
    },
  },
  {
    name: 'nado_get_account',
    description: 'Get a wallet\'s NADO account summary: balances, margin, positions, and health.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        address: { type: 'string', description: 'Wallet address (uses EVM_PRIVATE_KEY address if not specified)' },
        subaccountName: { type: 'string', description: 'Subaccount name (default: "default")' },
      },
    },
  },
  {
    name: 'nado_get_positions',
    description: 'Get open perp positions for a wallet on NADO.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        address: { type: 'string', description: 'Wallet address' },
        subaccountName: { type: 'string', description: 'Subaccount name (default: "default")' },
      },
    },
  },
  {
    name: 'nado_get_open_orders',
    description: 'Get open orders for a wallet on NADO.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        address: { type: 'string', description: 'Wallet address' },
        markets: { type: 'array', items: { type: 'string' }, description: 'Filter by markets (e.g. ["BTC-PERP", "ETH-PERP"])' },
        subaccountName: { type: 'string', description: 'Subaccount name (default: "default")' },
      },
    },
  },
  {
    name: 'nado_get_trade_history',
    description: 'Get recent trade/fill history for a wallet on NADO.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        address: { type: 'string', description: 'Wallet address' },
        market: { type: 'string', description: 'Filter by market (optional)' },
        limit: { type: 'number', description: 'Number of trades to return (default 20)' },
        subaccountName: { type: 'string', description: 'Subaccount name (default: "default")' },
      },
    },
  },
  {
    name: 'nado_place_order',
    description: 'Place a limit or market order on NADO. Positive amount = buy/long, negative = sell/short. Requires EVM_PRIVATE_KEY.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        market: { type: 'string', description: 'Market name (e.g. BTC-PERP, ETH-PERP)' },
        amount: { type: 'number', description: 'Order size in base asset. Positive = buy/long, negative = sell/short' },
        price: { type: 'number', description: 'Limit price in USD. Use 0 for market order (IOC)' },
        timeInForce: { type: 'string', enum: ['GTC', 'IOC', 'FOK'], description: 'GTC = good-till-cancel, IOC = immediate-or-cancel (market), FOK = fill-or-kill' },
        subaccountName: { type: 'string', description: 'Subaccount name (default: "default")' },
      },
      required: ['market', 'amount', 'price'],
    },
  },
  {
    name: 'nado_cancel_order',
    description: 'Cancel a specific open order on NADO by digest. Requires EVM_PRIVATE_KEY.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        market: { type: 'string', description: 'Market name' },
        digest: { type: 'string', description: 'Order digest (hash) from nado_get_open_orders' },
        subaccountName: { type: 'string', description: 'Subaccount name (default: "default")' },
      },
      required: ['market', 'digest'],
    },
  },
  {
    name: 'nado_deposit',
    description: 'Deposit collateral into your NADO subaccount to enable trading. Approves the token and calls depositCollateral on the NADO endpoint. Requires EVM_PRIVATE_KEY.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        token: { type: 'string', description: 'Token to deposit: USDT0, WETH, kBTC, USDC, SolvBTC, or token address' },
        amount: { type: 'number', description: 'Amount to deposit in token units (e.g. 25 for $25 USDT0)' },
        subaccountName: { type: 'string', description: 'Subaccount name (default: "default")' },
      },
      required: ['token', 'amount'],
    },
  },
  {
    name: 'nado_withdraw',
    description: 'Withdraw collateral from your NADO subaccount back to your wallet. Requires EVM_PRIVATE_KEY.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        token: { type: 'string', description: 'Token to withdraw: USDT0, WETH, kBTC, USDC, SolvBTC, or token address' },
        amount: { type: 'number', description: 'Amount to withdraw in token units' },
        subaccountName: { type: 'string', description: 'Subaccount name (default: "default")' },
        sendTo: { type: 'string', description: 'Recipient address (defaults to your wallet)' },
      },
      required: ['token', 'amount'],
    },
  },
  {
    name: 'nado_cancel_all',
    description: 'Cancel all open orders for a market on NADO. Requires EVM_PRIVATE_KEY.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        market: { type: 'string', description: 'Market name' },
        subaccountName: { type: 'string', description: 'Subaccount name (default: "default")' },
      },
      required: ['market'],
    },
  },
];

// ── Tool handler ──────────────────────────────────────────────────────
export async function handleNadoTool(name: string, args: Record<string, unknown>) {
  switch (name) {

    case 'nado_get_markets': {
      const perpIds = Object.values(MARKETS).filter(m => m.type === 'perp').map(m => m.productId);
      const prices = await archiveQuery({ perp_prices: { product_ids: perpIds } }) as Record<string, { index_price_x18: string; mark_price_x18: string }>;
      const fundingRates = await Promise.all(
        perpIds.slice(0, 10).map(id =>
          archiveQuery({ funding_rate: { product_id: id } }).catch(() => null)
        )
      );

      const result = Object.entries(MARKETS).map(([symbol, { productId, type }]) => {
        const p = prices[productId.toString()];
        return {
          symbol,
          productId,
          type,
          indexPrice: p ? fromX18(p.index_price_x18).toFixed(6) : null,
          markPrice: p ? fromX18(p.mark_price_x18).toFixed(6) : null,
        };
      });
      return { markets: result };
    }

    case 'nado_get_market_price': {
      const { productId, type } = resolveMarket(args.market as string);
      if (type === 'perp') {
        const [priceData, fundingData] = await Promise.all([
          archiveQuery({ perp_prices: { product_ids: [productId] } }) as Promise<Record<string, { index_price_x18: string; mark_price_x18: string }>>,
          archiveQuery({ funding_rate: { product_id: productId } }) as Promise<{ funding_rate_x18: string; update_time: string }>,
        ]);
        const p = (priceData as Record<string, { index_price_x18: string; mark_price_x18: string }>)[productId.toString()];
        const annualizedFunding = fromX18((fundingData as { funding_rate_x18: string }).funding_rate_x18) * 24 * 365 * 100;
        return {
          market: args.market,
          productId,
          type,
          indexPrice: fromX18(p.index_price_x18).toFixed(4),
          markPrice: fromX18(p.mark_price_x18).toFixed(4),
          basis: ((fromX18(p.mark_price_x18) / fromX18(p.index_price_x18) - 1) * 100).toFixed(4) + '%',
          fundingRate8h: (fromX18((fundingData as { funding_rate_x18: string }).funding_rate_x18) * 8 * 100).toFixed(6) + '%',
          fundingRateAnnualized: annualizedFunding.toFixed(2) + '%',
        };
      } else {
        const data = await archiveQuery({ price: { product_id: productId } }) as { index_price_x18: string; mark_price_x18: string };
        return {
          market: args.market,
          productId,
          type: 'spot',
          price: fromX18(data.index_price_x18).toFixed(6),
        };
      }
    }

    case 'nado_get_candlesticks': {
      const { productId } = resolveMarket(args.market as string);
      const granularity = (args.granularity as number) || 3600;
      const limit = Math.min((args.limit as number) || 20, 100);
      const data = await archiveQuery({ candlesticks: { product_id: productId, granularity, limit } }) as { candlesticks: Array<{ timestamp: string; open_x18: string; high_x18: string; low_x18: string; close_x18: string; volume: string }> };
      return {
        market: args.market,
        granularitySeconds: granularity,
        candles: (data.candlesticks || []).map(c => ({
          timestamp: parseInt(c.timestamp),
          open: fromX18(c.open_x18).toFixed(4),
          high: fromX18(c.high_x18).toFixed(4),
          low: fromX18(c.low_x18).toFixed(4),
          close: fromX18(c.close_x18).toFixed(4),
          volume: fromX18(c.volume).toFixed(4),
        })),
      };
    }

    case 'nado_get_funding_rate': {
      const { productId } = resolveMarket(args.market as string);
      const [current, historical] = await Promise.all([
        archiveQuery({ funding_rate: { product_id: productId } }) as Promise<{ funding_rate_x18: string; update_time: string }>,
        archiveQuery({ funding_rates: { product_ids: [productId], limit: 8 } }).catch(() => null),
      ]);
      const rate8h = fromX18(current.funding_rate_x18) * 8 * 100;
      return {
        market: args.market,
        productId,
        fundingRate8h: rate8h.toFixed(6) + '%',
        fundingRateAnnualized: (rate8h * 3 * 365).toFixed(2) + '%',
        lastUpdated: new Date(parseInt(current.update_time) * 1000).toISOString(),
        history: historical,
      };
    }

    case 'nado_get_account': {
      const address = (args.address as string) ?? await getAccount().catch(() => null);
      if (!address) throw new Error('No address provided and no wallet configured. Pass `address` or set EVM_PRIVATE_KEY env / OS keychain key via `npx moltiverse-mcp-setup`.');
      const subName = (args.subaccountName as string) || 'default';
      const subaccount = encodeSubaccount(address as string, subName);
      const ts = Math.floor(Date.now() / 1000);
      const data = await archiveQuery({ account_snapshots: { subaccounts: [subaccount], timestamps: [ts] } }) as Record<string, unknown>;

      // Response structure: { snapshots: [ { timestamp, balances: [ { product_id, balance: {...} } ] } ] }
      // OR nested: { [subaccount]: { [timestamp]: [ events... ] } }
      // Handle both formats robustly
      let events: Array<{ product_id: number; post_balance?: { spot?: { balance: { amount: string } }; perp?: { balance: { amount: string; v_quote_balance: string } } } }> = [];
      try {
        if (Array.isArray(data?.snapshots)) {
          // Direct snapshots array format
          events = (data.snapshots as Array<{ balances: typeof events }>)[0]?.balances || [];
        } else {
          // Nested dict format: { subaccount_key: { timestamp_key: events[] } }
          const outer = Object.values(data);
          for (const val of outer) {
            if (val && typeof val === 'object' && !Array.isArray(val)) {
              const inner = Object.values(val as Record<string, unknown>);
              for (const arr of inner) {
                if (Array.isArray(arr) && arr.length > 0) {
                  events = arr as typeof events;
                  break;
                }
              }
              if (events.length > 0) break;
            } else if (Array.isArray(val) && val.length > 0) {
              events = val as typeof events;
              break;
            }
          }
        }
      } catch { /* parsing failed — return empty balances */ }

      const balances = events.map(e => {
        const spot = e.post_balance?.spot;
        const perp = e.post_balance?.perp;
        if (spot) return { productId: e.product_id, type: 'spot', amount: fromX18(spot.balance.amount).toFixed(6) };
        if (perp) return { productId: e.product_id, type: 'perp', size: fromX18(perp.balance.amount).toFixed(6), vQuote: fromX18(perp.balance.v_quote_balance).toFixed(4) };
        return null;
      }).filter(Boolean);

      return { address, subaccount: subName, balances, raw: events.length === 0 ? data : undefined };
    }

    case 'nado_get_positions': {
      const address = (args.address as string) ?? await getAccount().catch(() => null);
      if (!address) throw new Error('No address provided and no wallet configured. Pass `address` or set EVM_PRIVATE_KEY env / OS keychain key.');
      const subName = (args.subaccountName as string) || 'default';
      const subaccount = encodeSubaccount(address as string, subName);
      const ts = Math.floor(Date.now() / 1000);
      const data = await archiveQuery({ account_snapshots: { subaccounts: [subaccount], timestamps: [ts] } }) as Record<string, unknown>;
      let events: Array<{ product_id: number; post_balance: { perp?: { balance: { amount: string; v_quote_balance: string; last_cumulative_funding_x18: string } } } }> = [];
      try {
        if (Array.isArray(data?.snapshots)) {
          events = (data.snapshots as Array<{ balances: typeof events }>)[0]?.balances || [];
        } else {
          for (const val of Object.values(data)) {
            if (val && typeof val === 'object' && !Array.isArray(val)) {
              for (const arr of Object.values(val as Record<string, unknown>)) {
                if (Array.isArray(arr) && arr.length > 0) { events = arr as typeof events; break; }
              }
              if (events.length > 0) break;
            } else if (Array.isArray(val) && val.length > 0) { events = val as typeof events; break; }
          }
        }
      } catch { /* parsing failed */ }

      const marketByPid = Object.fromEntries(Object.entries(MARKETS).map(([sym, m]) => [m.productId.toString(), sym]));
      const positions = events
        .filter(e => e.post_balance?.perp && fromX18(e.post_balance.perp.balance.amount) !== 0)
        .map(e => {
          const p = e.post_balance.perp!;
          const size = fromX18(p.balance.amount);
          return {
            market: marketByPid[e.product_id.toString()] || `product_${e.product_id}`,
            productId: e.product_id,
            side: size > 0 ? 'long' : 'short',
            size: Math.abs(size).toFixed(6),
            vQuoteBalance: fromX18(p.balance.v_quote_balance).toFixed(4),
          };
        });

      return { address, subaccount: subName, positions };
    }

    case 'nado_get_open_orders': {
      const address = (args.address as string) ?? await getAccount().catch(() => null);
      if (!address) throw new Error('No address provided and no wallet configured. Pass `address` or set EVM_PRIVATE_KEY env / OS keychain key.');
      const subName = (args.subaccountName as string) || 'default';
      const subaccount = encodeSubaccount(address as string, subName);
      const markets = args.markets as string[] | undefined;
      const productIds = markets
        ? markets.map(m => resolveMarket(m).productId)
        : Object.values(MARKETS).map(m => m.productId);
      const data = await archiveQuery({ orders: { subaccounts: [subaccount], product_ids: productIds } }) as { orders?: Array<{ product_id: number; digest: string; order: { priceX18: string; amount: string; expiration: string } }> };
      const marketByPid = Object.fromEntries(Object.entries(MARKETS).map(([sym, m]) => [m.productId.toString(), sym]));
      return {
        address,
        orders: (data.orders || []).map(o => ({
          market: marketByPid[o.product_id.toString()] || `product_${o.product_id}`,
          digest: o.digest,
          price: fromX18(o.order.priceX18).toFixed(4),
          amount: fromX18(o.order.amount).toFixed(6),
          side: parseFloat(o.order.amount) > 0 ? 'buy' : 'sell',
          expiration: new Date(parseInt(o.order.expiration)).toISOString(),
        })),
      };
    }

    case 'nado_get_trade_history': {
      const address = (args.address as string) ?? await getAccount().catch(() => null);
      if (!address) throw new Error('No address provided and no wallet configured. Pass `address` or set EVM_PRIVATE_KEY env / OS keychain key.');
      const subName = (args.subaccountName as string) || 'default';
      const subaccount = encodeSubaccount(address as string, subName);
      const limit = Math.min((args.limit as number) || 20, 100);
      const productIds = args.market
        ? [resolveMarket(args.market as string).productId]
        : Object.values(MARKETS).map(m => m.productId);
      const data = await archiveQuery({ matches: { subaccount, product_ids: productIds, limit } }) as { matches?: Array<{ product_id: number; digest: string; order: { priceX18: string; amount: string }; base_filled: string; quote_filled: string; fee: string }> };
      const marketByPid = Object.fromEntries(Object.entries(MARKETS).map(([sym, m]) => [m.productId.toString(), sym]));
      return {
        trades: (data.matches || []).map(m => ({
          market: marketByPid[m.product_id.toString()] || `product_${m.product_id}`,
          digest: m.digest,
          side: parseFloat(m.base_filled) > 0 ? 'buy' : 'sell',
          size: Math.abs(fromX18(m.base_filled)).toFixed(6),
          price: fromX18(m.order.priceX18).toFixed(4),
          quoteValue: Math.abs(fromX18(m.quote_filled)).toFixed(4),
          fee: fromX18(m.fee).toFixed(6),
        })),
      };
    }

    case 'nado_place_order': {
      const pk = await getPrivateKey();
      if (!pk) throw new Error('No EVM private key found for order placement. Set EVM_PRIVATE_KEY env or run `npx moltiverse-mcp-setup` to store one in the OS keychain.');
      const { productId } = resolveMarket(args.market as string);
      const subName = (args.subaccountName as string) || 'default';
      const account = privateKeyToAccount(pk as `0x${string}`);
      const subaccount = encodeSubaccount(account.address, subName);

      const tif = ((args.timeInForce as string) || 'GTC').toUpperCase();
      const amount = args.amount as number;
      const price = args.price as number;

      // NADO: TIF is in appendix orderType, expiration is a plain timestamp (seconds)
      const nowSec = Math.floor(Date.now() / 1000);
      const orderType = tif === 'IOC' ? 1 : tif === 'FOK' ? 2 : 0; // 0=GTC, 1=IOC, 2=FOK
      const expiration = tif === 'GTC'
        ? BigInt(nowSec + 365 * 86400)  // GTC: 1 year
        : BigInt(nowSec + 60);          // IOC/FOK: 60 seconds

      // For market orders (price=0), use extreme limit prices so the order fills immediately
      const orderPrice = price > 0 ? price : (amount > 0 ? 999999999 : 0.000001);

      const { order, signature } = await signOrder({
        productId,
        price: orderPrice,
        amount,
        expiration,
        orderType,
        subaccount,
        privateKey: pk,
      });

      const result = await gatewayExecute({
        place_order: {
          product_id: productId,
          order,  // appendix included + signed inside signOrder
          signature,
        },
      });

      return { market: args.market, side: amount > 0 ? 'buy' : 'sell', amount, price, tif, result };
    }

    case 'nado_cancel_order': {
      const pk = await getPrivateKey();
      if (!pk) throw new Error('No EVM private key found. Set EVM_PRIVATE_KEY env or run `npx moltiverse-mcp-setup`.');
      const { productId } = resolveMarket(args.market as string);
      const subName = (args.subaccountName as string) || 'default';
      const account = privateKeyToAccount(pk as `0x${string}`);
      const subaccount = encodeSubaccount(account.address, subName);
      const digest = args.digest as string;
      const nonce = getOrderNonce();

      const signature = await signTypedData({
        privateKey: pk as `0x${string}`,
        domain: { name: 'Nado', version: '0.0.1', chainId: CHAIN_ID, verifyingContract: ENDPOINT as Address },
        types: {
          Cancellation: [
            { name: 'sender', type: 'bytes32' },
            { name: 'productIds', type: 'uint32[]' },
            { name: 'digests', type: 'bytes32[]' },
            { name: 'nonce', type: 'uint64' },
          ],
        },
        primaryType: 'Cancellation',
        message: {
          sender: subaccount as `0x${string}`,
          productIds: [productId],
          digests: [digest as `0x${string}`],
          nonce,
        },
      });

      const result = await gatewayExecute({
        cancel_orders: {
          tx: {
            sender: subaccount,
            productIds: [productId],
            digests: [digest],
            nonce: nonce.toString(),
          },
          signature,
        },
      });
      return { market: args.market, cancelledDigest: digest, result };
    }

    case 'nado_cancel_all': {
      const pk = await getPrivateKey();
      if (!pk) throw new Error('No EVM private key found. Set EVM_PRIVATE_KEY env or run `npx moltiverse-mcp-setup`.');
      const { productId } = resolveMarket(args.market as string);
      const subName = (args.subaccountName as string) || 'default';
      const account = privateKeyToAccount(pk as `0x${string}`);
      const subaccount = encodeSubaccount(account.address, subName);
      const nonce = getOrderNonce();

      const signature = await signTypedData({
        privateKey: pk as `0x${string}`,
        domain: { name: 'Nado', version: '0.0.1', chainId: CHAIN_ID, verifyingContract: ENDPOINT as Address },
        types: {
          CancellationProducts: [
            { name: 'sender', type: 'bytes32' },
            { name: 'productIds', type: 'uint32[]' },
            { name: 'nonce', type: 'uint64' },
          ],
        },
        primaryType: 'CancellationProducts',
        message: {
          sender: subaccount as `0x${string}`,
          productIds: [productId],
          nonce,
        },
      });

      const result = await gatewayExecute({
        cancel_product_orders: {
          tx: {
            sender: subaccount,
            productIds: [productId],
            nonce: nonce.toString(),
          },
          signature,
        },
      });
      return { market: args.market, result };
    }

    case 'nado_deposit': {
      const wc = await getWalletClient();
      const account = wc.account;
      const subName = (args.subaccountName as string) || 'default';
      const tokenArg = args.token as string;
      const amount = args.amount as number;

      // Resolve token
      const tokenUpper = tokenArg.toUpperCase();
      const tokenInfo = Object.values(SPOT_TOKENS).find(t => t.symbol === tokenUpper)
        ?? (tokenArg.startsWith('0x') ? { address: tokenArg as Address, decimals: 18, symbol: tokenArg } : null);
      if (!tokenInfo) throw new Error(`Unknown token: ${tokenArg}. Supported: ${Object.values(SPOT_TOKENS).map(t => t.symbol).join(', ')}`);

      const productId = Object.entries(SPOT_TOKENS).find(([, v]) => v.symbol === tokenUpper)?.[0]
        ?? Object.entries(SPOT_TOKENS).find(([, v]) => v.address.toLowerCase() === tokenArg.toLowerCase())?.[0];
      if (productId === undefined) throw new Error(`Cannot resolve productId for ${tokenArg}`);

      const amountRaw = BigInt(Math.round(amount * 10 ** tokenInfo.decimals));
      const subaccountNameBytes12 = encodeSubaccountName(subName);

      // Approve
      const allowance = await publicClient.readContract({
        address: tokenInfo.address, abi: ERC20_APPROVE_ABI,
        functionName: 'approve', args: [ENDPOINT as Address, maxUint256],
      }).catch(() => 0n);
      const approveHash = await wc.writeContract({
        address: tokenInfo.address, abi: ERC20_APPROVE_ABI,
        functionName: 'approve', args: [ENDPOINT as Address, maxUint256],
        account,
      });
      await publicClient.waitForTransactionReceipt({ hash: approveHash });

      // Deposit
      const depositHash = await wc.writeContract({
        address: ENDPOINT as Address, abi: ENDPOINT_ABI,
        functionName: 'depositCollateral',
        args: [subaccountNameBytes12, parseInt(productId), amountRaw],
        account,
      });
      await publicClient.waitForTransactionReceipt({ hash: depositHash });

      return { token: tokenInfo.symbol, amount, subaccount: subName, txHash: depositHash };
    }

    case 'nado_withdraw': {
      // NADO withdrawals use slow-mode on-chain transactions (not gateway)
      // Docs: https://docs.nado.xyz/developer-resources/api/withdrawing-on-chain
      // Requires 1 USDT0 approval for the slow-mode fee
      const wc = await getWalletClient();
      const account = wc.account;
      const subName = (args.subaccountName as string) || 'default';
      const subaccount = encodeSubaccount(account.address, subName);
      const tokenArg = args.token as string;
      const amount = args.amount as number;

      const tokenUpper = tokenArg.toUpperCase();
      const tokenInfo = Object.values(SPOT_TOKENS).find(t => t.symbol === tokenUpper)
        ?? (tokenArg.startsWith('0x') ? { address: tokenArg as Address, decimals: 18, symbol: tokenArg } : null);
      if (!tokenInfo) throw new Error(`Unknown token: ${tokenArg}. Supported: ${Object.values(SPOT_TOKENS).map(t => t.symbol).join(', ')}`);

      const productId = Object.entries(SPOT_TOKENS).find(([, v]) => v.symbol === tokenUpper)?.[0]
        ?? Object.entries(SPOT_TOKENS).find(([, v]) => v.address.toLowerCase() === tokenArg.toLowerCase())?.[0];
      if (productId === undefined) throw new Error(`Cannot resolve productId for ${tokenArg}`);

      const amountRaw = BigInt(Math.round(amount * 10 ** tokenInfo.decimals));

      // Approve 1 USDT0 for slow-mode fee
      const usdt0 = SPOT_TOKENS[0];
      const feeApproveHash = await wc.writeContract({
        address: usdt0.address, abi: ERC20_APPROVE_ABI,
        functionName: 'approve', args: [ENDPOINT as Address, BigInt(1e6)], // 1 USDT0 = 1e6
        account,
      });
      await publicClient.waitForTransactionReceipt({ hash: feeApproveHash });

      // Encode WithdrawCollateral struct: { sender: bytes32, productId: uint32, amount: uint128, nonce: uint64 }
      // Then pack as: abi.encodePacked(uint8(2), abi.encode(struct))
      const encodedStruct = encodeAbiParameters(
        parseAbiParameters('bytes32, uint32, uint128, uint64'),
        [subaccount as `0x${string}`, parseInt(productId), amountRaw, 0n],
      );
      // Transaction type 2 = WithdrawCollateral, packed as single byte prefix
      const slowModeTx = encodePacked(['uint8', 'bytes'], [2, encodedStruct]);

      const hash = await wc.writeContract({
        address: ENDPOINT as Address, abi: ENDPOINT_ABI,
        functionName: 'submitSlowModeTransaction',
        args: [slowModeTx],
        account,
      });
      await publicClient.waitForTransactionReceipt({ hash });

      return { token: tokenInfo.symbol, amount, subaccount: subName, txHash: hash, note: 'Slow-mode withdrawal submitted. 1 USDT0 fee charged. Processing takes a few seconds.' };
    }

    default:
      throw new Error(`Unknown nado tool: ${name}`);
  }
}
