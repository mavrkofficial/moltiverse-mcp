// Solana ERC-8004 agent identity tools — wraps the QuantuLabs `8004-solana` SDK
// (https://github.com/QuantuLabs/8004-solana-ts).
//
// Mirrors the EVM identity_* tools in src/tools/identity.ts but for Solana mainnet-beta.
// The user is responsible for hosting metadata JSON at a publicly reachable HTTPS or
// ipfs:// URI; the SDK enforces a 250-byte max URI length.

import { SolanaSDK, buildRegistrationFileJson } from '8004-solana';
import { PublicKey } from '@solana/web3.js';
import { SOLANA_CONFIG } from '../config.js';
import { getSolanaKeypair } from '../keychain.js';

const MAX_URI_LEN = 250;

// Lazily build the SDK so read-only tools work without a key.
async function getReadOnlySDK(): Promise<SolanaSDK> {
  return new SolanaSDK({
    cluster: 'mainnet-beta',
    rpcUrl: SOLANA_CONFIG.rpcUrl,
  });
}

async function getSignerSDK(): Promise<SolanaSDK> {
  const signer = await getSolanaKeypair();
  if (!signer) {
    throw new Error('No Solana key configured. Set SOL_PRIVATE_KEY env var or run `npx moltiverse-mcp-setup` to store one in the OS keychain.');
  }
  return new SolanaSDK({
    cluster: 'mainnet-beta',
    rpcUrl: SOLANA_CONFIG.rpcUrl,
    signer,
  });
}

// ── Tool Definitions ─────────────────────────────────────────────────

export const solanaIdentityTools = [
  {
    name: 'solana_identity_register',
    description: 'Register a Solana ERC-8004 agent identity via the QuantuLabs 8004-solana SDK. Mints an agent NFT under the configured Solana wallet. Required before solana_sentry_agent_launch. The metadata URI must be < 250 bytes and publicly reachable (HTTPS or ipfs://). Use `name` + `description` to have the tool build and return a metadata JSON template you can host yourself, or pass `metadataUri` directly if you have already hosted one.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        metadataUri: { type: 'string', description: 'Publicly hosted metadata URI (HTTPS or ipfs://). Max 250 bytes. Required if not building inline.' },
        name: { type: 'string', description: 'Agent name. Used to build metadata JSON if metadataUri is not provided (template only — you must host the JSON yourself).' },
        description: { type: 'string', description: 'Agent description. Used alongside name when building metadata JSON.' },
        atomEnabled: { type: 'boolean', description: 'Opt into the SDK ATOM reputation engine at registration time. IRREVERSIBLE. Default: false.' },
      },
    },
  },
  {
    name: 'solana_identity_check_registered',
    description: 'Check if a Solana wallet owns at least one 8004 agent NFT. Returns count and a list of agent asset pubkeys. Defaults to the configured Solana wallet if no address is provided. Note: uses getAgentsByOwner which requires a premium RPC (Helius/QuickNode/Alchemy) configured via SOLANA_RPC_URL.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        address: { type: 'string', description: 'Solana wallet pubkey (defaults to configured wallet)' },
      },
    },
  },
  {
    name: 'solana_identity_get_agent',
    description: 'Load an agent NFT by its asset pubkey. Returns owner, agent_uri, and on-chain metadata.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        agentAsset: { type: 'string', description: 'Agent asset pubkey (returned from solana_identity_register)' },
      },
      required: ['agentAsset'],
    },
  },
  {
    name: 'solana_identity_get_owner_agents',
    description: 'List all 8004 agent NFTs owned by a Solana wallet. Returns full agent objects (asset pubkey + agent URI). Defaults owner to the configured wallet. Requires a premium RPC.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        address: { type: 'string', description: 'Wallet pubkey (defaults to configured wallet)' },
      },
    },
  },
  {
    name: 'solana_identity_set_agent_uri',
    description: 'Update the agent_uri of an existing agent NFT. Owner only. New URI must be < 250 bytes and publicly reachable.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        agentAsset: { type: 'string', description: 'Agent asset pubkey to update' },
        metadataUri: { type: 'string', description: 'New metadata URI (HTTPS or ipfs://, max 250 bytes)' },
      },
      required: ['agentAsset', 'metadataUri'],
    },
  },
  {
    name: 'solana_identity_total_registered',
    description: 'Get the total number of agents registered in the Solana 8004 registry. Uses getAllAgents() which requires a premium RPC.',
    inputSchema: { type: 'object' as const, properties: {} },
  },
];

// ── Handler ──────────────────────────────────────────────────────────

export async function handleSolanaIdentityTool(name: string, args: Record<string, unknown>) {
  switch (name) {
    case 'solana_identity_register': {
      const metadataUri = args.metadataUri as string | undefined;
      const agentName = args.name as string | undefined;
      const description = args.description as string | undefined;
      const atomEnabled = (args.atomEnabled as boolean) ?? false;

      // If no metadataUri provided, build a metadata template the caller can host
      // and return it (without registering).
      if (!metadataUri) {
        if (!agentName || !description) {
          throw new Error('Either `metadataUri` OR (`name` + `description`) is required. Without metadataUri, this tool returns a metadata JSON template for you to host yourself (e.g. on Supabase, IPFS, or any HTTPS host) and then re-call with metadataUri.');
        }
        const metadata = buildRegistrationFileJson({
          name: agentName,
          description,
          services: [],
          skills: [],
          domains: [],
          x402Support: false,
        });
        return {
          status: 'metadata_template_only',
          message: 'No metadataUri provided. Returning a metadata JSON template. Host this somewhere publicly reachable, then re-call solana_identity_register with metadataUri pointing at the hosted JSON. The URI must be < 250 bytes.',
          metadata,
          metadataJson: JSON.stringify(metadata, null, 2),
        };
      }

      if (Buffer.byteLength(metadataUri, 'utf-8') > MAX_URI_LEN) {
        throw new Error(`metadataUri exceeds MAX_URI_LEN of ${MAX_URI_LEN} bytes (got ${Buffer.byteLength(metadataUri, 'utf-8')}).`);
      }

      const sdk = await getSignerSDK();
      const result = await sdk.registerAgent(metadataUri, { atomEnabled }) as any;

      // The SDK return shape varies — extract whichever fields exist.
      const asset = result.asset?.toBase58?.() ?? String(result.asset ?? '');
      const signature = result.signature ?? result.signatures?.[0] ?? null;

      return {
        agentAsset: asset,
        signature,
        metadataUri,
        atomEnabled,
        message: 'Agent identity registered. Save the agentAsset pubkey — it is your Solana 8004 identity, required by solana_sentry_agent_launch.',
      };
    }

    case 'solana_identity_check_registered': {
      let address: PublicKey;
      if (args.address) {
        address = new PublicKey(args.address as string);
      } else {
        const signer = await getSolanaKeypair();
        if (!signer) {
          throw new Error('No address provided and no Solana key configured. Pass `address` or set SOL_PRIVATE_KEY env / OS keychain key.');
        }
        address = signer.publicKey;
      }

      const sdk = await getReadOnlySDK();
      const agents = await sdk.getAgentsByOwner(address);
      const isRegistered = agents.length > 0;

      return {
        address: address.toBase58(),
        isRegistered,
        identityCount: agents.length,
        agentAssets: agents.map((a: any) => (a.asset?.toBase58?.() ?? a.asset ?? a)?.toString?.() ?? String(a)),
        message: isRegistered
          ? `Wallet holds ${agents.length} Solana 8004 identity NFT(s). Ready to launch tokens via solana_sentry_agent_launch.`
          : 'Not registered on Solana. Call solana_identity_register first — required before solana_sentry_agent_launch.',
      };
    }

    case 'solana_identity_get_agent': {
      const agentAsset = new PublicKey(args.agentAsset as string);
      const sdk = await getReadOnlySDK();

      const [agent, owner] = await Promise.all([
        sdk.loadAgent(agentAsset),
        sdk.getAgentOwner(agentAsset).catch(() => null),
      ]);

      // The agent object exposes various fields depending on SDK version. Extract
      // the most useful ones into a stable shape.
      const a = agent as any;
      return {
        agentAsset: agentAsset.toBase58(),
        owner: owner ? (owner as any).toBase58?.() ?? String(owner) : null,
        agentUri: a.agent_uri ?? a.agentUri ?? null,
        agentWallet: a.getAgentWalletPublicKey?.()?.toBase58?.() ?? null,
        ownerPubkey: a.getOwnerPublicKey?.()?.toBase58?.() ?? null,
        raw: a,
      };
    }

    case 'solana_identity_get_owner_agents': {
      let address: PublicKey;
      if (args.address) {
        address = new PublicKey(args.address as string);
      } else {
        const signer = await getSolanaKeypair();
        if (!signer) {
          throw new Error('No address provided and no Solana key configured. Pass `address` or set SOL_PRIVATE_KEY env / OS keychain key.');
        }
        address = signer.publicKey;
      }

      const sdk = await getReadOnlySDK();
      const agents = await sdk.getAgentsByOwner(address);

      return {
        address: address.toBase58(),
        count: agents.length,
        agents: agents.map((a: any) => ({
          asset: (a.asset?.toBase58?.() ?? a.asset ?? '').toString(),
          agentUri: a.agent_uri ?? a.agentUri ?? null,
        })),
      };
    }

    case 'solana_identity_set_agent_uri': {
      const agentAsset = new PublicKey(args.agentAsset as string);
      const metadataUri = args.metadataUri as string;

      if (Buffer.byteLength(metadataUri, 'utf-8') > MAX_URI_LEN) {
        throw new Error(`metadataUri exceeds MAX_URI_LEN of ${MAX_URI_LEN} bytes (got ${Buffer.byteLength(metadataUri, 'utf-8')}).`);
      }

      const sdk = await getSignerSDK();
      const sig = await sdk.setAgentUri(agentAsset, metadataUri);

      return {
        agentAsset: agentAsset.toBase58(),
        metadataUri,
        signature: typeof sig === 'string' ? sig : (sig as any)?.signature ?? null,
      };
    }

    case 'solana_identity_total_registered': {
      const sdk = await getReadOnlySDK();
      try {
        const all = await sdk.getAllAgents();
        return { totalRegistered: all.length };
      } catch (e: any) {
        return {
          totalRegistered: null,
          error: e?.message ?? String(e),
          note: 'getAllAgents requires a premium RPC (Helius/QuickNode/Alchemy) configured via SOLANA_RPC_URL.',
        };
      }
    }

    default:
      throw new Error(`Unknown solana_identity tool: ${name}`);
  }
}
