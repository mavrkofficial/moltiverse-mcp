import { type Address, type Hash } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import {
  Connection,
  PublicKey,
  TransactionInstruction,
  TransactionMessage,
  VersionedTransaction,
  AddressLookupTableAccount,
} from '@solana/web3.js';
import {
  getAccount,
  sendTxOnChain,
  getPublicClientForChain,
} from '../client.js';
import { getPrivateKey, getSolanaKeypair } from '../keychain.js';
import { SOLANA_CONFIG } from '../config.js';

const RELAY_API = 'https://api.relay.link';
const INK_CHAIN_ID = 57073;
const SOLANA_CHAIN_ID = 792703809; // Relay's internal Solana mainnet chain id
const ECLIPSE_CHAIN_ID = 9286185;
const SOON_CHAIN_ID = 9286186;
const SVM_ORIGIN_CHAINS = new Set<number>([SOLANA_CHAIN_ID, ECLIPSE_CHAIN_ID, SOON_CHAIN_ID]);
// Non-EVM, non-SVM origins we can't sign for at all
const NON_EVM_SVM_CHAINS = new Set<number>([1337, 3586256, 8253038, 728126428]); // hyperliquid, lighter, bitcoin, tron

/**
 * Resolve the default `user` address for a given Relay chain ID. Used by
 * read tools (relay_get_quote, relay_get_price, relay_get_requests) to pick
 * the right wallet identifier based on the requested chain — without this,
 * those tools always defaulted to the EVM address from getAccount() and
 * Relay's API rejected Solana-origin requests with "Invalid address ... for
 * chain 792703809".
 */
async function defaultUserForChain(chainId: number | undefined): Promise<string> {
  if (chainId !== undefined && SVM_ORIGIN_CHAINS.has(chainId)) {
    const signer = await getSolanaKeypair();
    if (!signer) {
      throw new Error(`Chain ${chainId} is SVM but no Solana key is configured. Pass \`user\` explicitly or set SOL_PRIVATE_KEY.`);
    }
    return signer.publicKey.toBase58();
  }
  if (chainId !== undefined && NON_EVM_SVM_CHAINS.has(chainId)) {
    throw new Error(`Chain ${chainId} uses a non-EVM/non-SVM VM. Pass \`user\` explicitly with an address valid on that chain.`);
  }
  // Default: any EVM chain (or chainId omitted entirely → assume Ink)
  return await getAccount();
}

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
    description: 'Get a quote for a cross-chain bridge or swap via Relay. Returns fees, estimated output, and executable steps. The `user` field defaults to the wallet matching the origin chain VM (Solana pubkey for SVM origins, EVM address for EVM origins). The `recipient` field defaults to the wallet matching the destination chain VM. Both can be overridden explicitly.',
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
  {
    name: 'relay_execute',
    description: 'Execute a swap or cross-chain bridge via Relay Protocol routing. Fetches a Relay quote, then signs and submits every transaction in the returned quote.steps using the configured wallet for the origin chain. Supported origins: any of the 60+ EVM chains in viem/chains (Ink, Base, Arbitrum, Optimism, Ethereum mainnet, Polygon, BNB, Avalanche, Linea, Scroll, zkSync, Blast, Berachain, Mantle, etc.) signed by the configured EVM key, plus Solana mainnet (792703809) signed by the configured Solana keypair. Destination can be any of the 70+ chains Relay supports. Useful for: (a) same-chain swaps where local DEX liquidity is thin, (b) cross-chain bridges in any direction between Solana and any EVM chain, (c) cross-chain EVM↔EVM bridges using a single private key. Per-chain RPC URLs default to viem\'s baked-in defaults but can be overridden via the EVM_RPC_OVERRIDES env var (JSON map from chainId to RPC URL). Cross-chain bridges originating from non-EVM/non-Solana chains (Bitcoin, Tron, Hyperliquid, Lighter) are not supported.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        originChainId: { type: 'number', description: 'Origin chain ID. Defaults to 57073 (Ink). Any EVM chain in viem/chains works (8453 Base, 42161 Arbitrum, 1 Ethereum, etc.) plus 792703809 (Solana mainnet).' },
        destinationChainId: { type: 'number', description: 'Destination chain ID. Defaults to same as originChainId (for single-chain swaps). Can be any Relay-supported chain.' },
        originCurrency: { type: 'string', description: 'Token address on origin chain. For EVM use 0x0000000000000000000000000000000000000000 for native gas token. For Solana use 11111111111111111111111111111111 for native SOL.' },
        destinationCurrency: { type: 'string', description: 'Token address on destination chain' },
        amount: { type: 'string', description: 'Input amount in smallest unit (wei for EVM, lamports for Solana)' },
        slippageBps: { type: 'number', description: 'Slippage tolerance in basis points (default: 100 = 1%). Forwarded to Relay.' },
        recipient: { type: 'string', description: 'Recipient address on the destination chain. Defaults: SVM destinations get the configured Solana pubkey; EVM destinations get the configured EVM address (same across all EVM chains).' },
      },
      required: ['originCurrency', 'destinationCurrency', 'amount'],
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
      const originChainId = args.originChainId as number | undefined;
      const destinationChainId = (args.destinationChainId as number | undefined) ?? originChainId;
      const user = (args.user as string) ?? await defaultUserForChain(originChainId);

      // Default recipient if omitted: pick the right wallet for the destination
      // chain's VM type. SVM destination → Solana pubkey. EVM destination → EVM
      // address. Without this, cross-chain quotes fall through to Relay's
      // recipient=user default, which is wrong for cross-VM bridges.
      let recipient = args.recipient as string | undefined;
      if (!recipient && destinationChainId !== undefined) {
        if (SVM_ORIGIN_CHAINS.has(destinationChainId)) {
          const signer = await getSolanaKeypair();
          if (signer) recipient = signer.publicKey.toBase58();
        } else if (!NON_EVM_SVM_CHAINS.has(destinationChainId)) {
          try { recipient = await getAccount(); } catch { /* no EVM key */ }
        }
      }

      const body: Record<string, unknown> = {
        user,
        originChainId,
        destinationChainId,
        originCurrency: args.originCurrency,
        destinationCurrency: args.destinationCurrency,
        amount: args.amount,
        tradeType: (args.tradeType as string) ?? 'EXACT_INPUT',
      };
      if (recipient) body.recipient = recipient;
      return relayFetch('/quote', 'POST', body);
    }

    case 'relay_get_price': {
      const originChainId = args.originChainId as number | undefined;
      const destinationChainId = args.destinationChainId as number | undefined;
      const user = (args.user as string) ?? await defaultUserForChain(originChainId);

      // /price needs an explicit recipient when origin and destination have
      // different VM types — otherwise Relay defaults recipient=user and
      // validates the user address against the destination chain, throwing
      // "Invalid address ... for chain ...".
      let recipient: string | undefined;
      if (destinationChainId !== undefined) {
        if (SVM_ORIGIN_CHAINS.has(destinationChainId)) {
          const signer = await getSolanaKeypair();
          if (signer) recipient = signer.publicKey.toBase58();
        } else if (!NON_EVM_SVM_CHAINS.has(destinationChainId)) {
          try { recipient = await getAccount(); } catch { /* no EVM key */ }
        }
      }

      const body: Record<string, unknown> = {
        user,
        originChainId,
        destinationChainId,
        originCurrency: args.originCurrency,
        destinationCurrency: args.destinationCurrency,
        amount: args.amount,
        tradeType: (args.tradeType as string) ?? 'EXACT_INPUT',
      };
      if (recipient) body.recipient = recipient;
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
      if (args.user) {
        params.user = args.user as string;
      } else {
        // Default user is chain-aware: if originChainId hints at Solana, use the
        // SOL pubkey; otherwise default to the EVM address.
        const hintChainId = (args.originChainId as number | undefined) ?? (args.destinationChainId as number | undefined);
        try {
          params.user = await defaultUserForChain(hintChainId);
        } catch {
          /* no wallet for this chain — let Relay return all of them or 400 */
        }
      }
      if (args.originChainId) params.originChainId = String(args.originChainId);
      if (args.destinationChainId) params.destinationChainId = String(args.destinationChainId);
      return relayFetch('/requests/v2', 'GET', params);
    }

    case 'relay_execute': {
      // Swap or cross-chain bridge via Relay. Branches on origin VM type:
      //   EVM (any viem-supported chain)  -> sign with configured EVM key, broadcast via per-chain client
      //   Solana mainnet (792703809)      -> sign with configured Solana keypair
      //   Eclipse / SOON / Bitcoin / Tron / Hyperliquid / Lighter -> reject (no wallet support yet)
      const originChainId = (args.originChainId as number) ?? INK_CHAIN_ID;
      const destinationChainId = (args.destinationChainId as number) ?? originChainId;

      // Determine the origin VM and resolve the "user" (origin-side signer address)
      const isSvmOrigin = SVM_ORIGIN_CHAINS.has(originChainId);
      const isUnsupportedOrigin = NON_EVM_SVM_CHAINS.has(originChainId);

      let user: string;
      if (isUnsupportedOrigin) {
        throw new Error(`Origin chain ${originChainId} uses a non-EVM/non-SVM VM and is not supported by relay_execute.`);
      } else if (isSvmOrigin) {
        if (originChainId !== SOLANA_CHAIN_ID) {
          throw new Error(`SVM origin chain ${originChainId} (Eclipse/SOON) is not yet supported. Only Solana mainnet (792703809) has an RPC configured. Use relay_get_quote and sign externally.`);
        }
        const signer = await getSolanaKeypair();
        if (!signer) {
          throw new Error('Solana origin requires a configured Solana key. Set SOL_PRIVATE_KEY env or run `npx moltiverse-mcp-setup`.');
        }
        user = signer.publicKey.toBase58();
      } else {
        // Any EVM chain — derive address from local EVM key
        const pk = await getPrivateKey();
        if (!pk) {
          throw new Error('EVM origin requires a configured EVM private key. Set EVM_PRIVATE_KEY env or run `npx moltiverse-mcp-setup`.');
        }
        user = privateKeyToAccount(pk as `0x${string}`).address;
      }

      // Default recipient picker. Relay supports 74 chains across multiple VMs.
      // The caller CAN always override with an explicit `recipient`, but when omitted
      // we try to pick a sensible default based on the destination VM type:
      //   - SVM destinations (Solana, Eclipse, SOON) -> Solana pubkey
      //   - EVM destinations (anything else) -> Ink EVM wallet (same address across all EVM chains)
      // For non-EVM/non-SVM destinations (Bitcoin, Tron, etc.) we require an explicit recipient.
      const SVM_DESTINATIONS = new Set([792703809, 9286185, 9286186]); // solana, eclipse, soon
      const NON_EVM_SVM = new Set([1337, 3586256, 8253038, 728126428]); // hyperliquid, lighter, bitcoin, tron

      let recipient = args.recipient as string | undefined;
      if (!recipient) {
        if (SVM_DESTINATIONS.has(destinationChainId)) {
          const svmSigner = await getSolanaKeypair();
          if (!svmSigner) {
            throw new Error(`Destination chain ${destinationChainId} is SVM but no Solana key is configured to derive a default recipient. Pass \`recipient\` explicitly.`);
          }
          recipient = svmSigner.publicKey.toBase58();
        } else if (NON_EVM_SVM.has(destinationChainId)) {
          throw new Error(`Destination chain ${destinationChainId} uses a non-EVM/non-SVM VM and has no default recipient. Pass \`recipient\` explicitly with an address valid on that chain.`);
        } else {
          // Default: EVM destination. Use the Ink EVM wallet address (valid on every EVM chain).
          try {
            recipient = await getAccount();
          } catch {
            throw new Error(`Cross-chain destination ${destinationChainId} requires an EVM wallet for default recipient, but no EVM key is configured. Pass \`recipient\` explicitly.`);
          }
        }
      }

      const quoteBody: Record<string, unknown> = {
        user,
        recipient,
        originChainId,
        destinationChainId,
        originCurrency: args.originCurrency,
        destinationCurrency: args.destinationCurrency,
        amount: args.amount,
        tradeType: 'EXACT_INPUT',
      };
      if (args.slippageBps !== undefined) {
        quoteBody.slippageTolerance = String(args.slippageBps);
      }

      const quote = await relayFetch('/quote', 'POST', quoteBody) as any;
      if (!quote?.steps || !Array.isArray(quote.steps)) {
        throw new Error(`Relay quote returned no executable steps: ${JSON.stringify(quote).slice(0, 500)}`);
      }

      // Executed tx records. Shape differs by VM — unified through a normalized structure.
      const submittedTxs: Array<{
        stepId: string;
        itemIndex: number;
        chain: 'evm' | 'solana';
        chainId: number;
        hash?: string;
        signature?: string;
        status: string;
      }> = [];

      if (!isSvmOrigin) {
        // ── EVM signing path (any viem-supported chain) ───────────────────
        // Cache one publicClient per chainId to avoid recreating it for each item.
        const publicClientCache = new Map<number, ReturnType<typeof getPublicClientForChain>>();
        for (const step of quote.steps) {
          if (!step.items || !Array.isArray(step.items)) continue;
          for (let i = 0; i < step.items.length; i++) {
            const item = step.items[i];
            if (item.status === 'complete') continue;
            const data = item.data;
            if (!data || !data.to || !data.data) {
              throw new Error(`Relay step "${step.id}" item ${i} has no executable EVM data: ${JSON.stringify(item).slice(0, 300)}`);
            }
            // Each Relay step item carries its own chainId (the step's home chain).
            // Fall back to the requested origin if not present.
            const stepChainId = data.chainId !== undefined ? Number(data.chainId) : originChainId;
            const value = data.value ? BigInt(data.value) : 0n;

            const { hash } = await sendTxOnChain(stepChainId, {
              to: data.to as Address,
              data: data.data as `0x${string}`,
              value,
            });

            // Wait for receipt on that specific chain
            let pubClient = publicClientCache.get(stepChainId);
            if (!pubClient) {
              pubClient = getPublicClientForChain(stepChainId);
              publicClientCache.set(stepChainId, pubClient);
            }
            const receipt = await pubClient.waitForTransactionReceipt({ hash });

            submittedTxs.push({
              stepId: step.id,
              itemIndex: i,
              chain: 'evm',
              chainId: stepChainId,
              hash,
              status: receipt.status,
            });
            if (receipt.status !== 'success') {
              throw new Error(`Relay step "${step.id}" item ${i} reverted on chain ${stepChainId} (tx=${hash})`);
            }
          }
        }
      } else {
        // ── Solana signing path ───────────────────────────────────────────
        const signer = await getSolanaKeypair();
        if (!signer) throw new Error('No Solana key configured (should have been caught earlier)');
        const conn = new Connection(SOLANA_CONFIG.rpcUrl, 'confirmed');

        for (const step of quote.steps) {
          if (!step.items || !Array.isArray(step.items)) continue;
          for (let i = 0; i < step.items.length; i++) {
            const item = step.items[i];
            if (item.status === 'complete') continue;
            const data = item.data;
            if (!data || !Array.isArray(data.instructions)) {
              throw new Error(`Relay step "${step.id}" item ${i} has no Solana instructions: ${JSON.stringify(item).slice(0, 300)}`);
            }

            // Convert Relay's serialized instructions into web3.js TransactionInstructions
            const ixs: TransactionInstruction[] = data.instructions.map((ix: any) => {
              return new TransactionInstruction({
                programId: new PublicKey(ix.programId),
                keys: (ix.keys as any[]).map((k) => ({
                  pubkey: new PublicKey(k.pubkey),
                  isSigner: !!k.isSigner,
                  isWritable: !!k.isWritable,
                })),
                data: Buffer.from(ix.data, 'hex'),
              });
            });

            // Fetch any address lookup tables referenced by the instructions
            const altAddresses: string[] = data.addressLookupTableAddresses ?? [];
            const alts: AddressLookupTableAccount[] = [];
            for (const addr of altAddresses) {
              const lut = await conn.getAddressLookupTable(new PublicKey(addr));
              if (lut.value) alts.push(lut.value);
            }

            // Build a v0 versioned transaction, sign, submit
            const { blockhash, lastValidBlockHeight } = await conn.getLatestBlockhash('confirmed');
            const messageV0 = new TransactionMessage({
              payerKey: signer.publicKey,
              recentBlockhash: blockhash,
              instructions: ixs,
            }).compileToV0Message(alts);

            const vtx = new VersionedTransaction(messageV0);
            vtx.sign([signer]);

            const sig = await conn.sendRawTransaction(vtx.serialize(), {
              skipPreflight: false,
              maxRetries: 3,
              preflightCommitment: 'confirmed',
            });

            const confirmation = await conn.confirmTransaction(
              { signature: sig, blockhash, lastValidBlockHeight },
              'confirmed',
            );
            const status = confirmation.value.err ? 'reverted' : 'success';
            submittedTxs.push({
              stepId: step.id,
              itemIndex: i,
              chain: 'solana',
              chainId: originChainId,
              signature: sig,
              status,
            });
            if (confirmation.value.err) {
              throw new Error(`Relay step "${step.id}" item ${i} reverted on Solana (sig=${sig}): ${JSON.stringify(confirmation.value.err)}`);
            }
          }
        }
      }

      // Pull request id and fee summary from quote details for the response
      const details = quote.details ?? {};
      const fees = quote.fees ?? {};
      const lastTx = submittedTxs[submittedTxs.length - 1];
      let explorer: string | null = null;
      if (lastTx) {
        if (lastTx.chain === 'solana') {
          explorer = `https://solscan.io/tx/${lastTx.signature}`;
        } else if (lastTx.chainId === INK_CHAIN_ID) {
          explorer = `https://explorer.inkonchain.com/tx/${lastTx.hash}`;
        } else {
          // Try to look up the chain's block explorer from viem/chains
          try {
            const chain = (await import('../client.js')).getChainByChainId(lastTx.chainId);
            const explorerUrl = chain.blockExplorers?.default?.url;
            if (explorerUrl) explorer = `${explorerUrl}/tx/${lastTx.hash}`;
          } catch {
            // Unknown chain, no explorer link
          }
        }
      }

      return {
        success: true,
        originChainId,
        destinationChainId,
        requestId: (quote as any).request?.id ?? quote.id ?? null,
        txs: submittedTxs,
        currencyIn: details.currencyIn,
        currencyOut: details.currencyOut,
        rate: details.rate,
        totalImpact: details.totalImpact,
        fees,
        explorer,
        statusCheck: quote.steps?.[0]?.items?.[0]?.check?.endpoint
          ? `${RELAY_API}${quote.steps[0].items[0].check.endpoint}`
          : null,
      };
    }

    default:
      throw new Error(`Unknown relay tool: ${name}`);
  }
}
