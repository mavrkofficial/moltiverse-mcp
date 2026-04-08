import {
  createPublicClient,
  createWalletClient,
  http,
  type Address,
  type Chain,
  type Hash,
  type PublicClient,
  type WalletClient,
} from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import * as viemChains from 'viem/chains';
import { ink } from './config.js';
import { getPrivateKey } from './keychain.js';

// ── Multi-chain helpers (for cross-chain relay_execute) ────────────────
//
// These helpers create viem clients for ARBITRARY EVM chains using the same
// private key loaded from env/keychain. Useful when an MCP tool needs to sign
// an origin tx on a chain other than Ink (e.g. Relay cross-chain bridges from
// Base, Arbitrum, Ethereum mainnet, etc.). The same keypair derives to the
// same address on every EVM chain, so the wallet is effectively multi-chain.
//
// Chain definitions come from viem/chains (300+ EVM chains shipped out of
// the box). RPC URLs fall back to the chain's default but can be overridden
// per-chain via EVM_RPC_OVERRIDES env var (JSON map from chainId -> rpc URL):
//   EVM_RPC_OVERRIDES='{"8453":"https://mainnet.base.org","42161":"https://..."}'

const chainsByChainId = new Map<number, Chain>();
for (const chain of Object.values(viemChains)) {
  if (chain && typeof chain === 'object' && 'id' in chain && typeof (chain as { id: unknown }).id === 'number') {
    chainsByChainId.set((chain as Chain).id, chain as Chain);
  }
}

function getChainRpcOverride(chainId: number): string | undefined {
  const raw = process.env.EVM_RPC_OVERRIDES;
  if (!raw) return undefined;
  try {
    const map = JSON.parse(raw) as Record<string, string>;
    return map[String(chainId)];
  } catch {
    return undefined;
  }
}

/**
 * Look up a viem Chain definition by chain ID. Covers the 300+ chains
 * shipped in viem/chains. Throws if the chain ID is unknown.
 */
export function getChainByChainId(chainId: number): Chain {
  const chain = chainsByChainId.get(chainId);
  if (!chain) {
    throw new Error(
      `No viem chain definition found for chainId ${chainId}. ` +
      `Only chains included in viem/chains can be used as cross-chain origins. ` +
      `If you need this chain, open an issue on the moltiverse-mcp repo.`,
    );
  }
  return chain;
}

/**
 * Get a read-only public client for any EVM chain. Uses the chain's default
 * RPC unless overridden via EVM_RPC_OVERRIDES env var.
 */
export function getPublicClientForChain(chainId: number): PublicClient {
  if (chainId === 57073) return publicClient as PublicClient; // reuse the default Ink client
  const chain = getChainByChainId(chainId);
  const rpc = getChainRpcOverride(chainId);
  return createPublicClient({ chain, transport: http(rpc) });
}

/**
 * Get a wallet client for any EVM chain, signed by the locally-held EVM
 * private key (env or OS keychain). The same key signs for every EVM chain
 * because addresses are derived deterministically from the private key.
 */
export async function getWalletClientForChain(chainId: number): Promise<WalletClient> {
  const pk = await getPrivateKey();
  if (!pk) throw new Error('No EVM private key found. Run: npx moltiverse-mcp-setup');
  const chain = getChainByChainId(chainId);
  const rpc = getChainRpcOverride(chainId);
  const account = privateKeyToAccount(pk as `0x${string}`);
  return createWalletClient({ account, chain, transport: http(rpc) });
}

/**
 * Send a transaction on a specific EVM chain. Broadcasts via that chain's
 * RPC instead of the default Ink RPC used by the static sendTx() helper.
 */
export async function sendTxOnChain(
  chainId: number,
  params: { to: Address; data: `0x${string}`; value?: bigint },
): Promise<{ hash: Hash }> {
  const wc = await getWalletClientForChain(chainId);
  const hash = await wc.sendTransaction({
    to: params.to,
    data: params.data,
    value: params.value ?? 0n,
    account: wc.account!,
    chain: wc.chain!,
  });
  return { hash };
}

// ── Public Client (always available) ──────────────────────────────────
export const publicClient = createPublicClient({
  chain: ink,
  transport: http(),
});

// ── Wallet Client (BYOA: local signing via keychain or EVM_PRIVATE_KEY) ──
export async function getWalletClient() {
  const pk = await getPrivateKey();
  if (!pk) throw new Error('No EVM private key found. Run: npx moltiverse-mcp-setup');
  const account = privateKeyToAccount(pk as `0x${string}`);
  return createWalletClient({ account, chain: ink, transport: http() });
}

// ── Agent Account ──────────────────────────────────────────────────────
export async function getAccount(): Promise<Address> {
  // BYOA: derive from local private key (keychain or env var)
  const pk = await getPrivateKey();
  if (pk) {
    return privateKeyToAccount(pk as `0x${string}`).address;
  }

  // Legacy: fetch from Molting API
  const base = process.env.SENTRY_API_BASE;
  const key = process.env.MOLTING_API_KEY;
  if (!base || !key) throw new Error('EVM_PRIVATE_KEY or (SENTRY_API_BASE + MOLTING_API_KEY) required');

  const res = await fetch(`${base.replace(/\/$/, '')}/api/molting/agent/me`, {
    headers: { Authorization: `Bearer ${key}` },
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Failed to fetch agent account: ${res.status} ${body}`);
  }
  const data = (await res.json()) as { address: string };
  return data.address as Address;
}

// ── Send Transaction ───────────────────────────────────────────────────
export async function sendTx(params: {
  to: Address;
  data: `0x${string}`;
  value?: bigint;
}): Promise<{ hash: Hash }> {
  const pk = await getPrivateKey();

  if (pk) {
    // BYOA: sign and broadcast locally
    const wc = await getWalletClient();
    const hash = await wc.sendTransaction({
      to: params.to,
      data: params.data,
      value: params.value ?? 0n,
    });
    return { hash };
  }

  // Legacy: remote signing via Molting API
  const base = process.env.SENTRY_API_BASE;
  const key = process.env.MOLTING_API_KEY;
  if (!base || !key) throw new Error('EVM_PRIVATE_KEY or (SENTRY_API_BASE + MOLTING_API_KEY) required');

  const res = await fetch(`${base.replace(/\/$/, '')}/api/molting/send-transaction`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      to: params.to,
      data: params.data,
      value: (params.value ?? 0n).toString(),
    }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Transaction API error: ${res.status} ${body}`);
  }
  const result = (await res.json()) as { success: boolean; txHash: string };
  if (!result.success) throw new Error('Transaction API returned success: false');
  return { hash: result.txHash as Hash };
}

// ── BigInt serializer ──────────────────────────────────────────────────
export function serializeBigInts(obj: unknown): unknown {
  if (typeof obj === 'bigint') return obj.toString();
  if (Array.isArray(obj)) return obj.map(serializeBigInts);
  if (obj !== null && typeof obj === 'object') {
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
      result[key] = serializeBigInts(value);
    }
    return result;
  }
  return obj;
}
