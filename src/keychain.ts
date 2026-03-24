const SERVICE = 'moltiverse-mcp';
const ACCOUNT = 'evm-private-key';

let _cached: string | null | undefined = undefined;

// keytar is a CJS module; dynamic import wraps it under .default in ESM
async function loadKeytar() {
  const mod = await import('keytar');
  return (mod as unknown as { default: typeof mod }).default ?? mod;
}

/**
 * Get the EVM private key. Priority:
 * 1. EVM_PRIVATE_KEY env var (allows override / server deployments)
 * 2. OS keychain (macOS Keychain, Windows Credential Manager, Linux Secret Service)
 */
export async function getPrivateKey(): Promise<string | null> {
  if (_cached !== undefined) return _cached;

  const envKey = process.env.EVM_PRIVATE_KEY;
  if (envKey) {
    _cached = envKey;
    return _cached;
  }

  try {
    const keytar = await loadKeytar();
    _cached = await keytar.getPassword(SERVICE, ACCOUNT);
  } catch {
    _cached = null;
  }

  return _cached;
}

export async function storePrivateKey(key: string): Promise<void> {
  const keytar = await loadKeytar();
  await keytar.setPassword(SERVICE, ACCOUNT, key);
}

export async function deletePrivateKey(): Promise<void> {
  const keytar = await loadKeytar();
  await keytar.deletePassword(SERVICE, ACCOUNT);
}

// ── Solana Key ────────────────────────────────────────────────────────

let _solCached: import('@solana/web3.js').Keypair | null | undefined = undefined;

export async function getSolanaKeypair(): Promise<import('@solana/web3.js').Keypair | null> {
  if (_solCached !== undefined) return _solCached;

  const envKey = process.env.SOL_PRIVATE_KEY;
  if (!envKey) {
    _solCached = null;
    return null;
  }

  try {
    const { Keypair } = await import('@solana/web3.js');
    if (envKey.startsWith('[')) {
      _solCached = Keypair.fromSecretKey(Uint8Array.from(JSON.parse(envKey)));
    } else {
      const bs58 = await import('bs58');
      _solCached = Keypair.fromSecretKey(bs58.default.decode(envKey));
    }
  } catch {
    _solCached = null;
  }

  return _solCached;
}
