import { getAccount } from '../client.js';

const RELAY_API = 'https://api.relay.link';

async function relayFetch(path: string, method: 'GET' | 'POST' = 'GET', body?: unknown) {
  const url = method === 'GET' && body
    ? `${RELAY_API}${path}?${new URLSearchParams(body as Record<string, string>).toString()}`
    : `${RELAY_API}${path}`;

  const res = await fetch(url, {
    method,
    headers: body && method === 'POST' ? { 'Content-Type': 'application/json' } : undefined,
    body: method === 'POST' && body ? JSON.stringify(body) : undefined,
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Relay API ${res.status}: ${text}`);
  }
  return res.json();
}

export const relayTools = [
  {
    name: 'relay_get_chains',
    description: 'Get all supported chains on Relay with their IDs, names, native currencies, and RPC URLs.',
    inputSchema: {
      type: 'object' as const,
      properties: {},
    },
  },
  {
    name: 'relay_get_currencies',
    description: 'Search for tokens/currencies available on Relay. Filter by chain, search term, or address.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        chainIds: { type: 'array', items: { type: 'number' }, description: 'Filter by chain IDs (e.g. [57073] for Ink)' },
        term: { type: 'string', description: 'Search term (e.g. "USDT", "WETH")' },
        address: { type: 'string', description: 'Token contract address' },
        verified: { type: 'boolean', description: 'Only return verified tokens (default true)' },
        limit: { type: 'number', description: 'Max results (default 20)' },
      },
    },
  },
  {
    name: 'relay_get_quote',
    description: 'Get a quote for a cross-chain bridge or swap via Relay. Returns fees, estimated output, and executable steps.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        originChainId: { type: 'number', description: 'Source chain ID (e.g. 8453 for Base)' },
        destinationChainId: { type: 'number', description: 'Destination chain ID (e.g. 57073 for Ink)' },
        originCurrency: { type: 'string', description: 'Token address on origin chain (use 0x0000000000000000000000000000000000000000 for native ETH)' },
        destinationCurrency: { type: 'string', description: 'Token address on destination chain' },
        amount: { type: 'string', description: 'Amount in wei (smallest unit)' },
        tradeType: { type: 'string', description: 'EXACT_INPUT or EXACT_OUTPUT (default EXACT_INPUT)' },
        recipient: { type: 'string', description: 'Recipient address (defaults to user/wallet)' },
      },
      required: ['originChainId', 'destinationChainId', 'originCurrency', 'destinationCurrency', 'amount'],
    },
  },
  {
    name: 'relay_get_price',
    description: 'Get a price estimate for a cross-chain bridge or swap (faster than full quote, no executable steps).',
    inputSchema: {
      type: 'object' as const,
      properties: {
        originChainId: { type: 'number', description: 'Source chain ID' },
        destinationChainId: { type: 'number', description: 'Destination chain ID' },
        originCurrency: { type: 'string', description: 'Token address on origin chain' },
        destinationCurrency: { type: 'string', description: 'Token address on destination chain' },
        amount: { type: 'string', description: 'Amount in wei' },
        tradeType: { type: 'string', description: 'EXACT_INPUT or EXACT_OUTPUT (default EXACT_INPUT)' },
      },
      required: ['originChainId', 'destinationChainId', 'originCurrency', 'destinationCurrency', 'amount'],
    },
  },
  {
    name: 'relay_get_token_price',
    description: 'Get the USD price of a token on a specific chain.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        chainId: { type: 'number', description: 'Chain ID' },
        address: { type: 'string', description: 'Token contract address (use 0x0000000000000000000000000000000000000000 for native)' },
      },
      required: ['chainId', 'address'],
    },
  },
  {
    name: 'relay_get_requests',
    description: 'Get Relay transaction status and history. Filter by hash, request ID, or user address.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        hash: { type: 'string', description: 'Transaction hash to look up' },
        id: { type: 'string', description: 'Relay request ID' },
        user: { type: 'string', description: 'User address (defaults to wallet)' },
        originChainId: { type: 'number', description: 'Filter by origin chain' },
        destinationChainId: { type: 'number', description: 'Filter by destination chain' },
      },
    },
  },
];

export async function handleRelayTool(name: string, args: Record<string, unknown>) {
  switch (name) {
    case 'relay_get_chains': {
      const data = await relayFetch('/chains');
      // Return a simplified list
      const chains = (data.chains ?? data).map((c: any) => ({
        id: c.id,
        name: c.displayName ?? c.name,
        nativeCurrency: c.currency?.symbol,
        depositEnabled: c.depositEnabled,
      }));
      return { count: chains.length, chains };
    }

    case 'relay_get_currencies': {
      const body: Record<string, unknown> = {};
      if (args.chainIds) body.chainIds = args.chainIds;
      if (args.term) body.term = args.term;
      if (args.address) body.address = args.address;
      if (args.verified !== undefined) body.verified = args.verified;
      else body.verified = true;
      body.limit = (args.limit as number) ?? 20;
      return relayFetch('/currencies/v1', 'POST', body);
    }

    case 'relay_get_quote': {
      const user = (args.user as string) ?? await getAccount();
      const body: Record<string, unknown> = {
        user,
        originChainId: args.originChainId,
        destinationChainId: args.destinationChainId,
        originCurrency: args.originCurrency,
        destinationCurrency: args.destinationCurrency,
        amount: args.amount,
        tradeType: (args.tradeType as string) ?? 'EXACT_INPUT',
      };
      if (args.recipient) body.recipient = args.recipient;
      return relayFetch('/quote', 'POST', body);
    }

    case 'relay_get_price': {
      const user = (args.user as string) ?? await getAccount();
      const body: Record<string, unknown> = {
        user,
        originChainId: args.originChainId,
        destinationChainId: args.destinationChainId,
        originCurrency: args.originCurrency,
        destinationCurrency: args.destinationCurrency,
        amount: args.amount,
        tradeType: (args.tradeType as string) ?? 'EXACT_INPUT',
      };
      return relayFetch('/price', 'POST', body);
    }

    case 'relay_get_token_price': {
      const chainId = args.chainId as number;
      const address = args.address as string;
      return relayFetch(`/currencies/token/price?chainId=${chainId}&address=${address}`);
    }

    case 'relay_get_requests': {
      const params: Record<string, string> = {};
      if (args.hash) params.hash = args.hash as string;
      if (args.id) params.id = args.id as string;
      if (args.user) params.user = args.user as string;
      else {
        try { params.user = await getAccount(); } catch { /* no wallet */ }
      }
      if (args.originChainId) params.originChainId = String(args.originChainId);
      if (args.destinationChainId) params.destinationChainId = String(args.destinationChainId);
      return relayFetch('/requests/v2', 'GET', params);
    }

    default:
      throw new Error(`Unknown relay tool: ${name}`);
  }
}
