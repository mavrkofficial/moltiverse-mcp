import { Connection, PublicKey } from '@solana/web3.js';
import { TOKEN_PROGRAM_ID, TOKEN_2022_PROGRAM_ID } from '@solana/spl-token';
import { SOLANA_CONFIG } from '../config.js';
import { getSolanaKeypair } from '../keychain.js';

const connection = new Connection(SOLANA_CONFIG.rpcUrl, 'confirmed');

// "Native SOL" mint indicators. Mirrors the EVM convention of erc20_balance
// accepting 0x0000000000000000000000000000000000000000 for native ETH.
//   - So11111111111111111111111111111111111111112 = canonical Wrapped SOL mint
//     (used by Jupiter, Orca, etc. as the conventional native SOL identifier)
//   - 11111111111111111111111111111111            = System Program (used by
//     Relay and some other protocols as their native SOL marker)
const NATIVE_SOL_INDICATORS = new Set<string>([
  'So11111111111111111111111111111111111111112',
  '11111111111111111111111111111111',
]);

export const solanaTokenTools = [
  {
    name: 'solana_token_balance',
    description: 'Get a token balance for a Solana wallet. Pass the SPL mint address to query an SPL token (sums across both Token Program and Token-2022 accounts). Pass "So11111111111111111111111111111111111111112" (Wrapped SOL) or "11111111111111111111111111111111" (System Program) as the mint to query the native SOL balance via getBalance — mirrors how erc20_balance accepts the zero address for native ETH. Defaults owner to the configured Solana wallet if omitted.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        mint: { type: 'string', description: 'SPL token mint address, OR the wrapped SOL mint (So111...112) / System Program (111...1) for native SOL' },
        owner: { type: 'string', description: 'Owner wallet pubkey (defaults to the configured Solana wallet)' },
      },
      required: ['mint'],
    },
  },
];

export async function handleSolanaTokenTool(name: string, args: Record<string, unknown>) {
  switch (name) {
    case 'solana_token_balance': {
      // Validate required arg before any pubkey construction (avoids the
      // "Cannot read properties of undefined (reading '_bn')" obscure error
      // that bubbled up when callers omitted `mint`).
      if (!args.mint || typeof args.mint !== 'string') {
        throw new Error('`mint` is required (string). Pass an SPL token mint address, or "So11111111111111111111111111111111111111112" / "11111111111111111111111111111111" for native SOL.');
      }

      // Resolve owner first — needed for both native SOL and SPL paths.
      let owner: PublicKey;
      if (args.owner) {
        try {
          owner = new PublicKey(args.owner as string);
        } catch {
          throw new Error(`Invalid owner pubkey: ${args.owner}`);
        }
      } else {
        const signer = await getSolanaKeypair();
        if (!signer) {
          throw new Error('No owner provided and no Solana key configured. Pass `owner` or set SOL_PRIVATE_KEY env / OS keychain key.');
        }
        owner = signer.publicKey;
      }

      const mintStr = args.mint as string;

      // ── Native SOL fast path ─────────────────────────────────────────────
      if (NATIVE_SOL_INDICATORS.has(mintStr)) {
        const lamports = await connection.getBalance(owner, 'confirmed');
        return {
          owner: owner.toBase58(),
          mint: mintStr,
          amount: lamports.toString(),
          decimals: 9,
          uiAmount: lamports / 1e9,
          symbol: 'SOL',
          isNative: true,
        };
      }

      // ── SPL token path ───────────────────────────────────────────────────
      let mint: PublicKey;
      try {
        mint = new PublicKey(mintStr);
      } catch {
        throw new Error(`Invalid mint pubkey: ${mintStr}`);
      }

      // Try both token programs since the user could hold either flavor.
      const [classicResp, token2022Resp] = await Promise.all([
        connection.getParsedTokenAccountsByOwner(owner, { mint, programId: TOKEN_PROGRAM_ID }).catch(() => ({ value: [] as any[] })),
        connection.getParsedTokenAccountsByOwner(owner, { mint, programId: TOKEN_2022_PROGRAM_ID }).catch(() => ({ value: [] as any[] })),
      ]);

      const all = [...classicResp.value, ...token2022Resp.value];

      let rawTotal = 0n;
      let decimals = 0;
      for (const { account } of all) {
        const info = (account.data as any).parsed?.info;
        if (!info) continue;
        const amt = info.tokenAmount;
        rawTotal += BigInt(amt.amount);
        decimals = amt.decimals; // assumes uniform decimals across accounts (always true for same mint)
      }

      // If no accounts at all, fetch decimals directly from mint.
      if (all.length === 0) {
        const info = await connection.getParsedAccountInfo(mint);
        const parsed = (info.value?.data as any)?.parsed?.info;
        decimals = parsed?.decimals ?? 0;
      }

      const ui = decimals > 0 ? Number(rawTotal) / Math.pow(10, decimals) : Number(rawTotal);

      return {
        owner: owner.toBase58(),
        mint: mint.toBase58(),
        amount: rawTotal.toString(),
        decimals,
        uiAmount: ui,
        tokenAccountCount: all.length,
        isNative: false,
      };
    }

    default:
      throw new Error(`Unknown solana_token tool: ${name}`);
  }
}
