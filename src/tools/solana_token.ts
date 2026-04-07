import { Connection, PublicKey } from '@solana/web3.js';
import { TOKEN_PROGRAM_ID, TOKEN_2022_PROGRAM_ID } from '@solana/spl-token';
import { SOLANA_CONFIG } from '../config.js';
import { getSolanaKeypair } from '../keychain.js';

const connection = new Connection(SOLANA_CONFIG.rpcUrl, 'confirmed');

export const solanaTokenTools = [
  {
    name: 'solana_token_balance',
    description: 'Get the SPL token balance for a Solana wallet. Sums balances across all associated token accounts for the mint (handles both Token Program and Token-2022). Returns 0 if no token accounts exist for the mint. Defaults owner to the configured Solana wallet if omitted.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        mint: { type: 'string', description: 'SPL token mint address' },
        owner: { type: 'string', description: 'Owner wallet pubkey (defaults to the configured Solana wallet)' },
      },
      required: ['mint'],
    },
  },
];

export async function handleSolanaTokenTool(name: string, args: Record<string, unknown>) {
  switch (name) {
    case 'solana_token_balance': {
      const mint = new PublicKey(args.mint as string);

      let owner: PublicKey;
      if (args.owner) {
        owner = new PublicKey(args.owner as string);
      } else {
        const signer = await getSolanaKeypair();
        if (!signer) {
          throw new Error('No owner provided and no Solana key configured. Pass `owner` or set SOL_PRIVATE_KEY env / OS keychain key.');
        }
        owner = signer.publicKey;
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
      };
    }

    default:
      throw new Error(`Unknown solana_token tool: ${name}`);
  }
}
