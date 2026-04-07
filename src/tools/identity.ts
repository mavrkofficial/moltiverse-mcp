import { type Address, decodeEventLog, encodeFunctionData, encodeAbiParameters, toHex } from 'viem';
import { publicClient, getAccount, sendTx } from '../client.js';
import { CONTRACTS } from '../config.js';
import { IdentityRegistryABI } from '../abis/IdentityRegistry.js';

const IDENTITY_REGISTRY = CONTRACTS.IdentityRegistry as Address;

// ── Tool Definitions ─────────────────────────────────────────────────

export const identityTools = [
  {
    name: 'identity_register',
    description: 'Register an ERC-8004 agent identity on the IdentityRegistry. Required before launching tokens via sentry_launch_agent(). Pass a name and description; the agentURI is built automatically as a base64 data URI.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        name: { type: 'string', description: 'Agent name (e.g. "my-trading-bot")' },
        description: { type: 'string', description: 'What the agent does' },
        metadata: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              key: { type: 'string', description: 'Metadata key (e.g. "domain", "twitter")' },
              value: { type: 'string', description: 'Metadata value (e.g. "myagent.ink", "@myhandle")' },
            },
            required: ['key', 'value'],
          },
          description: 'Optional key/value metadata pairs (domain, twitter, etc.)',
        },
      },
      required: ['name', 'description'],
    },
  },
  {
    name: 'identity_get_agent',
    description: 'Get the agentURI and decoded metadata for an ERC-8004 identity by agent ID (token ID).',
    inputSchema: {
      type: 'object' as const,
      properties: {
        agentId: { type: 'string', description: 'Agent identity token ID' },
      },
      required: ['agentId'],
    },
  },
  {
    name: 'identity_set_agent_uri',
    description: 'Update the agentURI for an existing ERC-8004 identity. Must be called by the identity NFT owner.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        agentId: { type: 'string', description: 'Agent identity token ID to update' },
        name: { type: 'string', description: 'Updated agent name' },
        description: { type: 'string', description: 'Updated agent description' },
      },
      required: ['agentId', 'name', 'description'],
    },
  },
  {
    name: 'identity_check_registered',
    description: 'Check if a wallet holds an ERC-8004 agent identity NFT. Returns true if registered (required for sentry_launch_agent).',
    inputSchema: {
      type: 'object' as const,
      properties: {
        address: { type: 'string', description: 'Wallet address to check (defaults to wallet)' },
      },
    },
  },
  {
    name: 'identity_get_owner_agents',
    description: 'Get all ERC-8004 agent identity token IDs owned by an address.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        address: { type: 'string', description: 'Wallet address (defaults to wallet)' },
      },
    },
  },
  {
    name: 'identity_total_registered',
    description: 'Get the total number of ERC-8004 agent identities registered on Ink.',
    inputSchema: { type: 'object' as const, properties: {} },
  },
];

// ── Helpers ───────────────────────────────────────────────────────────

function buildAgentURI(name: string, description: string): string {
  const metadata = {
    type: 'https://eips.ethereum.org/EIPS/eip-8004#registration-v1',
    name,
    description,
    services: [],
    active: true,
    registrations: [
      {
        agentId: 0,
        agentRegistry: `eip155:57073:${CONTRACTS.IdentityRegistryProxy}`,
      },
    ],
    supportedTrust: ['reputation'],
  };
  const encoded = Buffer.from(JSON.stringify(metadata)).toString('base64');
  return `data:application/json;base64,${encoded}`;
}

function decodeAgentURI(uri: string): Record<string, unknown> | null {
  try {
    const prefix = 'data:application/json;base64,';
    if (!uri.startsWith(prefix)) return null;
    const json = Buffer.from(uri.slice(prefix.length), 'base64').toString('utf-8');
    return JSON.parse(json);
  } catch {
    return null;
  }
}

// ── Handler ──────────────────────────────────────────────────────────

export async function handleIdentityTool(name: string, args: Record<string, unknown>) {
  switch (name) {
    case 'identity_register': {
      const agentName = args.name as string;
      const description = args.description as string;
      const rawMeta = (args.metadata as Array<{ key: string; value: string }>) ?? [];

      const agentURI = buildAgentURI(agentName, description);

      // Encode metadata tuples — each value as bytes
      const metadataTuples = rawMeta.map(({ key, value }) => ({
        key,
        value: toHex(new TextEncoder().encode(value)),
      }));

      const data = encodeFunctionData({
        abi: IdentityRegistryABI,
        functionName: 'register',
        args: [agentURI, metadataTuples],
      });

      const { hash } = await sendTx({ to: IDENTITY_REGISTRY, data });
      const receipt = await publicClient.waitForTransactionReceipt({ hash });

      // Parse AgentRegistered or Transfer event to get agentId
      let agentId: string | undefined;
      for (const log of receipt.logs) {
        try {
          const event = decodeEventLog({
            abi: IdentityRegistryABI,
            data: log.data,
            topics: log.topics,
          });
          if (event.eventName === 'AgentRegistered') {
            const eventArgs = event.args as { agentId: bigint };
            agentId = eventArgs.agentId.toString();
          } else if (event.eventName === 'Transfer' && !agentId) {
            const eventArgs = event.args as { tokenId: bigint };
            agentId = eventArgs.tokenId.toString();
          }
        } catch { /* not our event */ }
      }

      return {
        hash,
        status: receipt.status,
        agentId,
        agentURI,
        registry: IDENTITY_REGISTRY,
        message: agentId
          ? `Agent identity #${agentId} registered. You can now launch tokens via sentry_launch_agent().`
          : 'Registration submitted. Check transaction for agentId.',
      };
    }

    case 'identity_get_agent': {
      const agentId = BigInt(args.agentId as string);

      const [uri, owner] = await Promise.all([
        publicClient.readContract({
          address: IDENTITY_REGISTRY, abi: IdentityRegistryABI,
          functionName: 'agentURI', args: [agentId],
        }),
        publicClient.readContract({
          address: IDENTITY_REGISTRY, abi: IdentityRegistryABI,
          functionName: 'ownerOf', args: [agentId],
        }),
      ]);

      const decoded = decodeAgentURI(uri as string);

      return {
        agentId: agentId.toString(),
        owner,
        agentURI: uri,
        metadata: decoded,
      };
    }

    case 'identity_set_agent_uri': {
      const agentId = BigInt(args.agentId as string);
      const agentName = args.name as string;
      const description = args.description as string;

      const agentURI = buildAgentURI(agentName, description);

      const data = encodeFunctionData({
        abi: IdentityRegistryABI,
        functionName: 'setAgentURI',
        args: [agentId, agentURI],
      });

      const { hash } = await sendTx({ to: IDENTITY_REGISTRY, data });
      const receipt = await publicClient.waitForTransactionReceipt({ hash });

      return { hash, status: receipt.status, agentId: agentId.toString(), agentURI };
    }

    case 'identity_check_registered': {
      const address = (args.address as Address) ?? await getAccount();

      const balance = await publicClient.readContract({
        address: IDENTITY_REGISTRY, abi: IdentityRegistryABI,
        functionName: 'balanceOf', args: [address],
      });

      const isRegistered = (balance as bigint) > 0n;

      return {
        address,
        isRegistered,
        identityCount: (balance as bigint).toString(),
        message: isRegistered
          ? `Wallet holds ${balance} identity NFT(s). Ready to launch tokens via sentry_launch_agent().`
          : 'Not registered. Call identity_register() first — required before sentry_launch_agent().',
      };
    }

    case 'identity_get_owner_agents': {
      const address = (args.address as Address) ?? await getAccount();

      const balance = await publicClient.readContract({
        address: IDENTITY_REGISTRY, abi: IdentityRegistryABI,
        functionName: 'balanceOf', args: [address],
      }) as bigint;

      const agentIds: string[] = [];
      for (let i = 0n; i < balance; i++) {
        const tokenId = await publicClient.readContract({
          address: IDENTITY_REGISTRY, abi: IdentityRegistryABI,
          functionName: 'tokenOfOwnerByIndex', args: [address, i],
        });
        agentIds.push((tokenId as bigint).toString());
      }

      return { address, agentIds, count: balance.toString() };
    }

    case 'identity_total_registered': {
      const total = await publicClient.readContract({
        address: IDENTITY_REGISTRY, abi: IdentityRegistryABI,
        functionName: 'totalSupply',
      });

      return { totalRegistered: (total as bigint).toString() };
    }

    default:
      throw new Error(`Unknown identity tool: ${name}`);
  }
}
