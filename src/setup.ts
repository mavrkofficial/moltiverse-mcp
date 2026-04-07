#!/usr/bin/env node
import * as process from 'process';
import { storePrivateKey, deletePrivateKey, storeSolanaKey, deleteSolanaKey } from './keychain.js';

function readSecret(prompt: string): Promise<string> {
  return new Promise((resolve) => {
    process.stdout.write(prompt);

    if (process.stdin.setRawMode) {
      process.stdin.setRawMode(true);
      process.stdin.resume();
      process.stdin.setEncoding('utf8');

      let input = '';
      const onData = (char: string) => {
        if (char === '\n' || char === '\r' || char === '\u0004') {
          process.stdin.setRawMode!(false);
          process.stdin.pause();
          process.stdin.removeListener('data', onData);
          process.stdout.write('\n');
          resolve(input);
        } else if (char === '\u0003') {
          process.stdout.write('\n');
          process.exit(0);
        } else if (char === '\u007f') {
          if (input.length > 0) {
            input = input.slice(0, -1);
            process.stdout.write('\b \b');
          }
        } else {
          input += char;
          process.stdout.write('*');
        }
      };
      process.stdin.on('data', onData);
    } else {
      let input = '';
      process.stdin.resume();
      process.stdin.setEncoding('utf8');
      process.stdin.on('data', (chunk: string) => { input += chunk; });
      process.stdin.on('end', () => resolve(input.trim()));
    }
  });
}

async function main() {
  const arg = process.argv[2];

  if (arg === 'delete') {
    await deletePrivateKey();
    await deleteSolanaKey();
    console.log('EVM and Solana keys removed from OS keychain.');
    return;
  }

  console.log('=== Moltiverse MCP — Secure Key Setup ===\n');
  console.log('Stores your wallet keys in the OS keychain:');
  console.log('  macOS   → Keychain');
  console.log('  Windows → Credential Manager');
  console.log('  Linux   → Secret Service (libsecret)\n');
  console.log('Once set, remove EVM_PRIVATE_KEY / SOL_PRIVATE_KEY from your MCP config.\n');

  // ── EVM Key ───────────────────────────────────────────────────────────

  const evmKey = await readSecret('EVM private key (0x...): ');

  if (!evmKey.match(/^0x[0-9a-fA-F]{64}$/)) {
    console.error('\nInvalid key — expected 0x followed by 64 hex characters.');
    process.exit(1);
  }

  try {
    await storePrivateKey(evmKey);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('\nFailed to store EVM key in OS keychain:', msg);
    console.error('On Linux, make sure libsecret is installed: sudo apt install libsecret-1-dev');
    process.exit(1);
  }

  console.log('\n✓ EVM key stored securely in OS keychain.\n');

  // ── Solana Key ────────────────────────────────────────────────────────

  const solKey = await readSecret('Solana private key (base58 or JSON byte array, leave blank to skip): ');

  if (solKey) {
    let pubkey: string;
    try {
      const { Keypair } = await import('@solana/web3.js');
      let keypair: InstanceType<typeof Keypair>;
      if (solKey.startsWith('[')) {
        const bytes = Uint8Array.from(JSON.parse(solKey) as number[]);
        if (bytes.length !== 64) throw new Error(`expected 64 bytes, got ${bytes.length}`);
        keypair = Keypair.fromSecretKey(bytes);
      } else {
        const bs58 = await import('bs58');
        const bytes = bs58.default.decode(solKey);
        if (bytes.length !== 64) throw new Error(`expected 64 bytes, got ${bytes.length}`);
        keypair = Keypair.fromSecretKey(bytes);
      }
      pubkey = keypair.publicKey.toBase58();
    } catch {
      console.error('\nInvalid Solana key — expected base58 string or JSON byte array of a 64-byte secret key.');
      process.exit(1);
    }

    try {
      await storeSolanaKey(solKey);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error('\nFailed to store Solana key in OS keychain:', msg);
      process.exit(1);
    }

    console.log(`\n✓ Solana key stored. Pubkey: ${pubkey}\n`);
  }

  console.log('  Run: npx moltiverse-mcp\n');
  console.log('To remove:  npx moltiverse-mcp-setup delete');
}

main().catch((err: unknown) => {
  console.error('Setup error:', err instanceof Error ? err.message : err);
  process.exit(1);
});
