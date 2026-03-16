import { type Address, zeroAddress } from 'viem';
import { publicClient, getWalletClient, getAccount } from '../client.js';

const API = 'https://zns.bio/api';
const TLD = 'ink';
const CHAIN_ID = 57073;
const ZNS_REGISTRY: Address = '0xFb2Cd41a8aeC89EFBb19575C6c48d872cE97A0A5';

// Minimal ZNS registry ABI for price lookup and registration
const ZNS_ABI = [
  {
    name: 'priceToRegister',
    type: 'function',
    inputs: [{ name: 'length', type: 'uint256' }],
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
  },
  {
    name: 'registerDomains',
    type: 'function',
    inputs: [
      { name: 'ownerAddresses', type: 'address[]' },
      { name: 'domainNames', type: 'string[]' },
      { name: 'expiries', type: 'uint256[]' },
      { name: 'referralAddress', type: 'address' },
      { name: 'credits', type: 'uint256' },
    ],
    outputs: [],
    stateMutability: 'payable',
  },
] as const;

async function apiGet(endpoint: string, params: Record<string, string | number>) {
  const qs = new URLSearchParams(Object.entries(params).map(([k, v]) => [k, String(v)]));
  const res = await fetch(`${API}/${endpoint}?${qs}`);
  if (!res.ok) throw new Error(`ZNS API ${endpoint} failed: ${res.status}`);
  return res.json();
}

export const znsTools = [
  {
    name: 'zns_resolve_domain',
    description: 'Resolve a .ink domain name to its owner wallet address.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        domain: { type: 'string', description: 'Domain name without TLD (e.g. "myagent") or with TLD (e.g. "myagent.ink")' },
      },
      required: ['domain'],
    },
  },
  {
    name: 'zns_resolve_address',
    description: 'Reverse lookup: find the .ink domain(s) owned by a wallet address.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        address: { type: 'string', description: 'Wallet address to look up (defaults to connected wallet)' },
      },
      required: [],
    },
  },
  {
    name: 'zns_check_domain',
    description: 'Check whether a .ink domain is available for registration.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        domain: { type: 'string', description: 'Domain name to check (without .ink TLD)' },
      },
      required: ['domain'],
    },
  },
  {
    name: 'zns_get_metadata',
    description: 'Get metadata for a registered .ink domain (avatar, description, social links, etc.).',
    inputSchema: {
      type: 'object' as const,
      properties: {
        domain: { type: 'string', description: 'Full domain (e.g. "myagent.ink") or name without TLD' },
      },
      required: ['domain'],
    },
  },
  {
    name: 'zns_get_price',
    description: 'Get the registration price for one or more .ink domains.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        domains: { type: 'array', items: { type: 'string' }, description: 'Array of domain names (without .ink TLD)' },
      },
      required: ['domains'],
    },
  },
  {
    name: 'zns_register',
    description: 'Register one or more .ink domain names to wallet addresses. Use zns_get_price first to check cost.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        domains: { type: 'array', items: { type: 'string' }, description: 'Domain names to register (without .ink TLD)' },
        owners: { type: 'array', items: { type: 'string' }, description: 'Owner addresses for each domain (defaults to connected wallet for all)' },
      },
      required: ['domains'],
    },
  },
];

function normalizeDomain(domain: string): string {
  return domain.endsWith(`.${TLD}`) ? domain.slice(0, -(TLD.length + 1)) : domain;
}

export async function handleZnsTool(name: string, args: Record<string, unknown>) {
  switch (name) {
    case 'zns_resolve_domain': {
      const domainName = normalizeDomain(args.domain as string);
      try {
        const data = await apiGet('resolveDomain', { chain: CHAIN_ID, domain: domainName });
        return { domain: `${domainName}.${TLD}`, address: data.address ?? null, found: !!data.address };
      } catch {
        return { domain: `${domainName}.${TLD}`, address: null, found: false };
      }
    }

    case 'zns_resolve_address': {
      const address = (args.address as Address) ?? await getAccount();
      const data = await apiGet('resolveAddress', { chain: CHAIN_ID, address });
      return {
        address,
        primaryDomain: data.primaryDomain ? `${data.primaryDomain}.${TLD}` : null,
        allDomains: (data.userOwnedDomains ?? []).map((d: string) => `${d}.${TLD}`),
      };
    }

    case 'zns_check_domain': {
      const domainName = normalizeDomain(args.domain as string);
      try {
        const data = await apiGet('resolveDomain', { chain: CHAIN_ID, domain: domainName });
        const available = !data.address;
        return { domain: `${domainName}.${TLD}`, available, currentOwner: data.address ?? null };
      } catch {
        // 404 = domain not found = available
        return { domain: `${domainName}.${TLD}`, available: true, currentOwner: null };
      }
    }

    case 'zns_get_metadata': {
      const domainName = normalizeDomain(args.domain as string);
      try {
        const data = await apiGet('resolveDomain', { chain: CHAIN_ID, domain: domainName });
        return { domain: `${domainName}.${TLD}`, metadata: data };
      } catch {
        return { domain: `${domainName}.${TLD}`, metadata: null, error: 'Domain not found' };
      }
    }

    case 'zns_get_price': {
      const domains = (args.domains as string[]).map(normalizeDomain);
      // Call priceToRegister on-chain for each domain length
      const prices = await Promise.all(
        domains.map(d =>
          publicClient.readContract({
            address: ZNS_REGISTRY,
            abi: ZNS_ABI,
            functionName: 'priceToRegister',
            args: [BigInt(d.length)],
          })
        )
      );
      const totalPrice = prices.reduce((sum, p) => sum + p, 0n);
      const formatted = Number(totalPrice) / 1e18;
      return {
        domains: domains.map(d => `${d}.${TLD}`),
        prices: domains.map((d, i) => ({ domain: `${d}.${TLD}`, priceETH: (Number(prices[i]) / 1e18).toFixed(6) })),
        totalPriceETH: formatted.toFixed(6),
        totalPriceWei: totalPrice.toString(),
      };
    }

    case 'zns_register': {
      const domains = (args.domains as string[]).map(normalizeDomain);
      const ownerArg = args.owners as string[] | undefined;
      const defaultOwner = await getAccount();
      const owners = ownerArg && ownerArg.length === domains.length
        ? ownerArg
        : domains.map(() => defaultOwner);

      // Get total price
      const prices = await Promise.all(
        domains.map(d =>
          publicClient.readContract({
            address: ZNS_REGISTRY,
            abi: ZNS_ABI,
            functionName: 'priceToRegister',
            args: [BigInt(d.length)],
          })
        )
      );
      const totalPrice = prices.reduce((sum, p) => sum + p, 0n);

      const expiries = domains.map(() => 1n); // 1 year
      const walletClient = await getWalletClient();
      const hash = await walletClient.writeContract({
        address: ZNS_REGISTRY,
        abi: ZNS_ABI,
        functionName: 'registerDomains',
        args: [owners as Address[], domains, expiries, zeroAddress, 0n],
        value: totalPrice,
      });
      const receipt = await publicClient.waitForTransactionReceipt({ hash });

      return {
        domains: domains.map(d => `${d}.${TLD}`),
        owners,
        totalPriceETH: (Number(totalPrice) / 1e18).toFixed(6),
        txHash: hash,
        status: receipt.status,
      };
    }

    default:
      throw new Error(`Unknown zns tool: ${name}`);
  }
}
