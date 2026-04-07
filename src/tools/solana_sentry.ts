import { Connection, PublicKey, VersionedTransaction } from '@solana/web3.js';
import { SOLANA_CONFIG } from '../config.js';
import { getSolanaKeypair } from '../keychain.js';
import { createHash } from 'crypto';

const PROGRAM_ID = new PublicKey(SOLANA_CONFIG.SentryLaunchFactory);
const connection = new Connection(SOLANA_CONFIG.rpcUrl, 'confirmed');
const API_BASE = SOLANA_CONFIG.sentryApiBase;

function findPDA(seeds: (Buffer | Uint8Array)[], pid: PublicKey): PublicKey {
  return PublicKey.findProgramAddressSync(seeds, pid)[0];
}

const LAUNCH_RECORD_DISCRIMINATOR = createHash('sha256')
  .update('account:LaunchRecord')
  .digest()
  .subarray(0, 8);

export const solanaSentryTools = [
  {
    name: 'solana_sentry_agent_launch',
    description: 'Launch a token on Solana via the Sentry Launch Factory API. Requires a Solana 8004 agent identity NFT. The API handles metadata upload, PDA derivation, ALT creation, and Orca CLMM pool setup. The single-sided LP position is held permanently inside the factory program itself (no external locker, no withdraw, no remove-liquidity — only fee collection). Returns a pre-built versioned transaction; pair with solana_sentry_submit which auto-signs from the configured Solana key (env or OS keychain) before submitting.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        name: { type: 'string', description: 'Token name (max 32 chars)' },
        symbol: { type: 'string', description: 'Token symbol (max 10 chars)' },
        image: { type: 'string', description: 'Image URL (https://...) or base64 data URI. The API uploads it to Supabase.' },
        agent_nft: { type: 'string', description: '8004 agent NFT address (Metaplex Core asset)' },
        creator: { type: 'string', description: 'Solana wallet public key (must own the agent NFT)' },
        description: { type: 'string', description: 'Optional token description' },
        website: { type: 'string', description: 'Optional website URL' },
        twitter: { type: 'string', description: 'Optional X/Twitter URL' },
        telegram: { type: 'string', description: 'Optional Telegram URL' },
      },
      required: ['name', 'symbol', 'image', 'agent_nft', 'creator'],
    },
  },
  {
    name: 'solana_sentry_submit',
    description: 'Submit the launch transaction returned by solana_sentry_agent_launch. Auto-signs unsigned transactions using the configured Solana key (SOL_PRIVATE_KEY env or OS keychain via moltiverse-mcp-setup). Pre-signed transactions are passed through unchanged.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        transaction: { type: 'string', description: 'Base64-encoded versioned transaction (signed or unsigned). Unsigned transactions are auto-signed before submission.' },
        token_mint: { type: 'string', description: 'Token mint address from the agent_launch response' },
      },
      required: ['transaction', 'token_mint'],
    },
  },
  {
    name: 'solana_sentry_lookup',
    description: 'Look up a token launched through the Sentry Launch Factory by its mint address. Returns creator, pool, timestamps, and whether it was an agent launch.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        mint: { type: 'string', description: 'Token mint address' },
      },
      required: ['mint'],
    },
  },
  {
    name: 'solana_sentry_list',
    description: 'List all tokens deployed through the Sentry Launch Factory on Solana. Optionally filter by creator.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        creator: { type: 'string', description: 'Optional: filter by creator wallet address' },
        agent_only: { type: 'boolean', description: 'Optional: only show agent-launched tokens (default: false)' },
      },
    },
  },
  {
    name: 'solana_sentry_stats',
    description: 'Get Sentry Launch Factory stats on Solana: total launches, admin, treasury, buyback config.',
    inputSchema: { type: 'object' as const, properties: {} },
  },
];

function parseLaunchRecord(data: Buffer): Record<string, unknown> {
  let offset = 8; // skip discriminator
  const tokenMint = new PublicKey(data.subarray(offset, offset + 32)).toBase58(); offset += 32;
  const whirlpool = new PublicKey(data.subarray(offset, offset + 32)).toBase58(); offset += 32;
  const positionMint = new PublicKey(data.subarray(offset, offset + 32)).toBase58(); offset += 32;
  const position = new PublicKey(data.subarray(offset, offset + 32)).toBase58(); offset += 32;
  const creator = new PublicKey(data.subarray(offset, offset + 32)).toBase58(); offset += 32;
  const launchIndex = Number(data.readBigUInt64LE(offset)); offset += 8;
  const launchedAt = Number(data.readBigInt64LE(offset)); offset += 8;
  const bump = data[offset]; offset += 1;
  const nameLen = data.readUInt32LE(offset); offset += 4;
  const name = data.subarray(offset, offset + nameLen).toString('utf8'); offset += nameLen;
  const symbolLen = data.readUInt32LE(offset); offset += 4;
  const symbol = data.subarray(offset, offset + symbolLen).toString('utf8'); offset += symbolLen;
  const isAgent = data[offset] === 1;

  return {
    tokenMint, whirlpool, positionMint, position, creator,
    launchIndex, launchedAt: new Date(launchedAt * 1000).toISOString(),
    name, symbol, isAgent,
  };
}

function parseFactoryConfig(data: Buffer): Record<string, unknown> {
  let offset = 8; // skip discriminator
  const admin = new PublicKey(data.subarray(offset, offset + 32)).toBase58(); offset += 32;
  const treasury = new PublicKey(data.subarray(offset, offset + 32)).toBase58(); offset += 32;
  offset += 32; // whirlpool_program
  offset += 32; // base_mint
  offset += 32; // whirlpools_config
  offset += 32; // fee_tier_key
  const totalLaunches = Number(data.readBigUInt64LE(offset)); offset += 8;
  offset += 1 + 1; // bump, authority_bump
  offset += 35; // LaunchDefaults
  const buybackMint = new PublicKey(data.subarray(offset, offset + 32)).toBase58(); offset += 32;
  offset += 32; // buyback_whirlpool
  const buybackEnabled = data[offset] === 1; offset += 1;
  const identityCollection = new PublicKey(data.subarray(offset, offset + 32)).toBase58(); offset += 32;
  const agentBuybackMint = new PublicKey(data.subarray(offset, offset + 32)).toBase58(); offset += 32;
  offset += 32; // agent_buyback_whirlpool
  const agentBuybackEnabled = data[offset] === 1;

  return {
    admin, treasury, totalLaunches,
    buybackMint, buybackEnabled,
    identityCollection, agentBuybackMint, agentBuybackEnabled,
  };
}

export async function handleSolanaSentryTool(name: string, args: Record<string, unknown>) {
  switch (name) {
    case 'solana_sentry_agent_launch': {
      const res = await fetch(`${API_BASE}/api/agent-launch`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: args.name,
          symbol: args.symbol,
          image: args.image,
          agent_nft: args.agent_nft,
          creator: args.creator,
          description: args.description,
          website: args.website,
          twitter: args.twitter,
          telegram: args.telegram,
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({ error: res.statusText }));
        throw new Error(`Agent launch API error ${res.status}: ${(body as any).error || JSON.stringify(body)}`);
      }
      const result = await res.json() as Record<string, unknown>;
      return {
        transaction: result.transaction,
        token_mint: result.token_mint,
        whirlpool: result.whirlpool,
        position_mint: result.position_mint,
        metadata_uri: result.metadata_uri,
        instructions: 'Sign this transaction with your Solana wallet, then call solana_sentry_submit with the signed transaction and token_mint.',
      };
    }

    case 'solana_sentry_submit': {
      // Auto-sign unsigned transactions using the configured Solana key.
      // Pre-signed txs are passed through unchanged.
      let txBase64 = args.transaction as string;
      try {
        const txBytes = Buffer.from(txBase64, 'base64');
        const vtx = VersionedTransaction.deserialize(txBytes);
        // A signature slot is "empty" when every byte is 0. If any required slot
        // is still empty, we need to sign locally before submitting.
        const needsSigning = vtx.signatures.some(sig => sig.every(b => b === 0));
        if (needsSigning) {
          const signer = await getSolanaKeypair();
          if (!signer) {
            throw new Error('Transaction is unsigned and no Solana key is configured. Set SOL_PRIVATE_KEY env var or run `npx moltiverse-mcp-setup` to store one in the OS keychain.');
          }
          vtx.sign([signer]);
          txBase64 = Buffer.from(vtx.serialize()).toString('base64');
        }
      } catch (e: any) {
        // If deserialization fails, fall through and let the API surface the error.
        // We only re-throw the explicit "no key" error from above.
        if (e?.message?.includes('no Solana key is configured')) throw e;
      }

      const res = await fetch(`${API_BASE}/api/agent-launch/submit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          transaction: txBase64,
          token_mint: args.token_mint,
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({ error: res.statusText }));
        throw new Error(`Submit API error ${res.status}: ${(body as any).error || JSON.stringify(body)}`);
      }
      return await res.json();
    }

    case 'solana_sentry_lookup': {
      const mint = new PublicKey(args.mint as string);
      const [launchRecordPDA] = PublicKey.findProgramAddressSync(
        [Buffer.from('launch'), mint.toBuffer()],
        PROGRAM_ID,
      );
      const info = await connection.getAccountInfo(launchRecordPDA);
      if (!info) throw new Error(`No launch record found for mint ${args.mint}. Token may not have been launched through the Sentry Factory.`);
      return parseLaunchRecord(Buffer.from(info.data));
    }

    case 'solana_sentry_list': {
      const accounts = await connection.getProgramAccounts(PROGRAM_ID, {
        filters: [
          { memcmp: { offset: 0, bytes: Buffer.from(LAUNCH_RECORD_DISCRIMINATOR).toString('base64'), encoding: 'base64' as any } },
        ],
      });

      let records: Record<string, unknown>[] = accounts.map(({ pubkey, account }) => {
        const parsed = parseLaunchRecord(Buffer.from(account.data));
        return { address: pubkey.toBase58(), ...parsed };
      });

      if (args.creator) {
        records = records.filter(r => r.creator === args.creator);
      }
      if (args.agent_only) {
        records = records.filter(r => r.isAgent === true);
      }

      records.sort((a, b) => (b.launchIndex as number) - (a.launchIndex as number));

      return { total: records.length, tokens: records };
    }

    case 'solana_sentry_stats': {
      const [factoryConfig] = PublicKey.findProgramAddressSync(
        [Buffer.from('factory_config')],
        PROGRAM_ID,
      );
      const info = await connection.getAccountInfo(factoryConfig);
      if (!info) throw new Error('Factory config account not found');
      return parseFactoryConfig(Buffer.from(info.data));
    }

    default:
      throw new Error(`Unknown solana_sentry tool: ${name}`);
  }
}
