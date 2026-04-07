// Solana Jupiter v6 swap — the canonical Solana DEX aggregator path.
//
// Replaces the fragile direct Orca Whirlpool path in solana_orca_swap with
// Jupiter's hosted aggregator, which:
// - Routes across every Solana DEX (Orca, Raydium, Meteora, Phoenix, etc.)
// - Handles all tick array initialization, ATA creation, and SOL wrapping internally
// - Returns a pre-built versioned transaction the caller just signs and submits
// - Falls back automatically if any single venue lacks liquidity
//
// API docs: https://station.jup.ag/api-v6/get-quote
//           https://station.jup.ag/api-v6/post-swap

import {
  Connection,
  PublicKey,
  VersionedTransaction,
} from '@solana/web3.js';
import { SOLANA_CONFIG } from '../config.js';
import { getSolanaKeypair } from '../keychain.js';

const JUP_QUOTE = 'https://quote-api.jup.ag/v6/quote';
const JUP_SWAP = 'https://quote-api.jup.ag/v6/swap';

const connection = new Connection(SOLANA_CONFIG.rpcUrl, 'confirmed');

export const solanaJupiterTools = [
  {
    name: 'solana_jupiter_quote',
    description: 'Get a swap quote from Jupiter v6 aggregator on Solana. Routes across all Solana DEXs (Orca, Raydium, Meteora, Phoenix, etc.) and returns the best route. Read-only.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        input_mint: { type: 'string', description: 'Input token mint (use So11111111111111111111111111111111111111112 for native SOL)' },
        output_mint: { type: 'string', description: 'Output token mint' },
        amount: { type: 'string', description: 'Input amount in smallest unit (lamports/raw)' },
        slippage_bps: { type: 'number', description: 'Slippage tolerance in basis points (default: 100 = 1%)' },
      },
      required: ['input_mint', 'output_mint', 'amount'],
    },
  },
  {
    name: 'solana_jupiter_swap',
    description: 'Execute a swap via Jupiter v6 aggregator on Solana. Auto-handles routing, ATAs, SOL wrap/unwrap, and tick arrays. Signs with the configured Solana key (env or OS keychain). Far more robust than direct Whirlpool swaps for newly-launched tokens or thin pools.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        input_mint: { type: 'string', description: 'Input token mint (use So11111111111111111111111111111111111111112 for native SOL)' },
        output_mint: { type: 'string', description: 'Output token mint' },
        amount: { type: 'string', description: 'Input amount in smallest unit (lamports/raw)' },
        slippage_bps: { type: 'number', description: 'Slippage tolerance in basis points (default: 100 = 1%)' },
        priority_fee_lamports: { type: 'number', description: 'Optional explicit priority fee in lamports. Default: Jupiter computes via auto.' },
      },
      required: ['input_mint', 'output_mint', 'amount'],
    },
  },
];

async function fetchQuote(params: {
  inputMint: string;
  outputMint: string;
  amount: string;
  slippageBps: number;
}): Promise<any> {
  const url = `${JUP_QUOTE}?inputMint=${params.inputMint}&outputMint=${params.outputMint}&amount=${params.amount}&slippageBps=${params.slippageBps}&onlyDirectRoutes=false&restrictIntermediateTokens=true`;
  const res = await fetch(url);
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Jupiter quote failed (${res.status}): ${body}`);
  }
  return await res.json();
}

export async function handleSolanaJupiterTool(name: string, args: Record<string, unknown>) {
  switch (name) {
    case 'solana_jupiter_quote': {
      const inputMint = args.input_mint as string;
      const outputMint = args.output_mint as string;
      const amount = args.amount as string;
      const slippageBps = (args.slippage_bps as number) ?? 100;

      const quote = await fetchQuote({ inputMint, outputMint, amount, slippageBps });
      return {
        inputMint: quote.inputMint,
        outputMint: quote.outputMint,
        inAmount: quote.inAmount,
        outAmount: quote.outAmount,
        otherAmountThreshold: quote.otherAmountThreshold,
        priceImpactPct: quote.priceImpactPct,
        slippageBps: quote.slippageBps,
        routePlan: (quote.routePlan as any[])?.map((step: any) => ({
          ammKey: step.swapInfo?.ammKey,
          label: step.swapInfo?.label,
          inputMint: step.swapInfo?.inputMint,
          outputMint: step.swapInfo?.outputMint,
          inAmount: step.swapInfo?.inAmount,
          outAmount: step.swapInfo?.outAmount,
          feeAmount: step.swapInfo?.feeAmount,
          percent: step.percent,
        })),
        contextSlot: quote.contextSlot,
        timeTaken: quote.timeTaken,
      };
    }

    case 'solana_jupiter_swap': {
      const inputMint = args.input_mint as string;
      const outputMint = args.output_mint as string;
      const amount = args.amount as string;
      const slippageBps = (args.slippage_bps as number) ?? 100;
      const priorityFeeLamports = args.priority_fee_lamports as number | undefined;

      const signer = await getSolanaKeypair();
      if (!signer) {
        throw new Error('No Solana key configured. Set SOL_PRIVATE_KEY env or run `npx moltiverse-mcp-setup` to store one in the OS keychain.');
      }

      // Step 1: get the quote
      const quote = await fetchQuote({ inputMint, outputMint, amount, slippageBps });
      if (!quote || !quote.outAmount) {
        throw new Error(`Jupiter quote returned no route: ${JSON.stringify(quote)}`);
      }

      // Step 2: get the swap transaction from Jupiter
      const swapBody: Record<string, unknown> = {
        quoteResponse: quote,
        userPublicKey: signer.publicKey.toBase58(),
        wrapAndUnwrapSol: true,
        dynamicComputeUnitLimit: true,
      };
      if (priorityFeeLamports !== undefined) {
        swapBody.prioritizationFeeLamports = priorityFeeLamports;
      } else {
        swapBody.prioritizationFeeLamports = 'auto';
      }

      const swapRes = await fetch(JUP_SWAP, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(swapBody),
      });
      if (!swapRes.ok) {
        const body = await swapRes.text();
        throw new Error(`Jupiter swap-build failed (${swapRes.status}): ${body}`);
      }
      const swapJson = await swapRes.json() as { swapTransaction: string; lastValidBlockHeight: number };

      // Step 3: deserialize, sign, send
      const txBytes = Buffer.from(swapJson.swapTransaction, 'base64');
      const vtx = VersionedTransaction.deserialize(txBytes);
      vtx.sign([signer]);

      const sig = await connection.sendRawTransaction(vtx.serialize(), {
        skipPreflight: false,
        maxRetries: 3,
        preflightCommitment: 'confirmed',
      });

      // Step 4: confirm
      const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash('confirmed');
      const confirmation = await connection.confirmTransaction(
        { signature: sig, blockhash, lastValidBlockHeight: swapJson.lastValidBlockHeight ?? lastValidBlockHeight },
        'confirmed',
      );

      if (confirmation.value.err) {
        throw new Error(`Jupiter swap reverted on-chain: ${JSON.stringify(confirmation.value.err)} (sig: ${sig})`);
      }

      return {
        signature: sig,
        explorer: `https://solscan.io/tx/${sig}`,
        inputMint,
        outputMint,
        inAmount: quote.inAmount,
        outAmount: quote.outAmount,
        priceImpactPct: quote.priceImpactPct,
        slippageBps,
        routeLabels: (quote.routePlan as any[])?.map((s: any) => s.swapInfo?.label).filter(Boolean),
      };
    }

    default:
      throw new Error(`Unknown solana_jupiter tool: ${name}`);
  }
}
