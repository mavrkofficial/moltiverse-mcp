import { Connection, PublicKey, Keypair, VersionedTransaction, TransactionMessage, Transaction, ComputeBudgetProgram, TransactionInstruction, SystemProgram } from '@solana/web3.js';
import { getAssociatedTokenAddressSync, TOKEN_PROGRAM_ID, NATIVE_MINT, createAssociatedTokenAccountIdempotentInstruction, createSyncNativeInstruction, createCloseAccountInstruction } from '@solana/spl-token';
import { SOLANA_CONFIG } from '../config.js';
import { getSolanaKeypair } from '../keychain.js';
import BN from 'bn.js';

const WHIRLPOOL_PROGRAM = new PublicKey(SOLANA_CONFIG.OrcaWhirlpoolProgram);
const WHIRLPOOLS_CONFIG = new PublicKey(SOLANA_CONFIG.OrcaWhirlpoolsConfig);
const connection = new Connection(SOLANA_CONFIG.rpcUrl, 'confirmed');

const TICK_ARRAY_SIZE = 88;

function findPDA(seeds: (Buffer | Uint8Array)[], pid: PublicKey): PublicKey {
  return PublicKey.findProgramAddressSync(seeds, pid)[0];
}

function getTickArrayStart(tick: number, ts: number): number {
  const real = TICK_ARRAY_SIZE * ts;
  let start = Math.trunc(tick / real) * real;
  if (tick < 0 && tick % real !== 0) start -= real;
  return start;
}

export const solanaOrcaTools = [
  {
    name: 'solana_orca_pool_info',
    description: 'Get Orca Whirlpool info for a token pair on Solana: current price, liquidity, tick, fee rate.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        token_a: { type: 'string', description: 'First token mint address' },
        token_b: { type: 'string', description: 'Second token mint address' },
        tick_spacing: { type: 'number', description: 'Tick spacing (default: 128 for 1% fee tier)' },
      },
      required: ['token_a', 'token_b'],
    },
  },
  {
    name: 'solana_orca_quote',
    description: 'Get an estimated swap output for an Orca Whirlpool swap on Solana. Read-only, does not execute.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        pool: { type: 'string', description: 'Whirlpool pool address' },
        input_mint: { type: 'string', description: 'Input token mint address' },
        amount: { type: 'string', description: 'Input amount in smallest unit (lamports/raw)' },
      },
      required: ['pool', 'input_mint', 'amount'],
    },
  },
  {
    name: 'solana_orca_swap',
    description: 'Execute a swap on an Orca Whirlpool on Solana. Requires SOL_PRIVATE_KEY.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        pool: { type: 'string', description: 'Whirlpool pool address' },
        input_mint: { type: 'string', description: 'Input token mint address (use So11111111111111111111111111111111111111112 for SOL)' },
        amount: { type: 'string', description: 'Input amount in smallest unit (lamports/raw)' },
        slippage_bps: { type: 'number', description: 'Slippage tolerance in basis points (default: 100 = 1%)' },
      },
      required: ['pool', 'input_mint', 'amount'],
    },
  },
];

function parseWhirlpoolData(data: Buffer) {
  let offset = 8; // discriminator
  offset += 32; // whirlpoolsConfig
  const whirlpoolBump = data.readUInt8(offset); offset += 2; // bump[0], bump[1]
  const tickSpacing = data.readUInt16LE(offset); offset += 2;
  offset += 2; // tickSpacingSeed
  const feeRate = data.readUInt16LE(offset); offset += 2;
  offset += 2; // protocolFeeRate
  const liquidityHex = data.readBigUInt64LE(offset).toString(); offset += 16; // u128
  const sqrtPrice = data.readBigUInt64LE(offset).toString(); offset += 16; // u128
  const tickCurrentIndex = data.readInt32LE(offset); offset += 4;
  offset += 8; // protocolFeeOwedA (u64)
  offset += 8; // protocolFeeOwedB (u64)
  const tokenMintA = new PublicKey(data.subarray(offset, offset + 32)).toBase58(); offset += 32;
  const tokenMintB = new PublicKey(data.subarray(offset, offset + 32)).toBase58(); offset += 32;
  const tokenVaultA = new PublicKey(data.subarray(offset, offset + 32)).toBase58(); offset += 32;
  const tokenVaultB = new PublicKey(data.subarray(offset, offset + 32)).toBase58(); offset += 32;

  return {
    tickSpacing, feeRate, feePercent: `${(feeRate / 10000).toFixed(2)}%`,
    liquidity: liquidityHex, sqrtPrice,
    tickCurrentIndex, tokenMintA, tokenMintB,
    tokenVaultA, tokenVaultB,
  };
}

export async function handleSolanaOrcaTool(name: string, args: Record<string, unknown>) {
  switch (name) {
    case 'solana_orca_pool_info': {
      const mintA = new PublicKey(args.token_a as string);
      const mintB = new PublicKey(args.token_b as string);
      const tickSpacing = (args.tick_spacing as number) || 128;

      const [sorted_a, sorted_b] = mintA.toBuffer().compare(mintB.toBuffer()) < 0
        ? [mintA, mintB] : [mintB, mintA];

      const pool = findPDA(
        [Buffer.from('whirlpool'), WHIRLPOOLS_CONFIG.toBuffer(), sorted_a.toBuffer(), sorted_b.toBuffer(), new BN(tickSpacing).toArrayLike(Buffer, 'le', 2)],
        WHIRLPOOL_PROGRAM,
      );

      const info = await connection.getAccountInfo(pool);
      if (!info) throw new Error(`No Orca Whirlpool found for this pair with tick spacing ${tickSpacing}`);

      return { pool: pool.toBase58(), ...parseWhirlpoolData(Buffer.from(info.data)) };
    }

    case 'solana_orca_quote': {
      const poolPk = new PublicKey(args.pool as string);
      const inputMint = new PublicKey(args.input_mint as string);
      const amount = BigInt(args.amount as string);

      const info = await connection.getAccountInfo(poolPk);
      if (!info) throw new Error('Pool not found');
      const poolData = parseWhirlpoolData(Buffer.from(info.data));

      const aToB = inputMint.toBase58() === poolData.tokenMintA;
      const sqrtPrice = BigInt(poolData.sqrtPrice);
      const liquidity = BigInt(poolData.liquidity);

      // Simplified constant-product estimate (not exact for CLMM but gives a ballpark)
      let estimatedOutput: bigint;
      if (liquidity === 0n) {
        estimatedOutput = 0n;
      } else if (aToB) {
        estimatedOutput = (amount * liquidity) / (liquidity + amount * sqrtPrice / (1n << 64n));
      } else {
        estimatedOutput = (amount * liquidity) / (liquidity + amount * (1n << 64n) / sqrtPrice);
      }

      return {
        pool: args.pool,
        input_mint: args.input_mint,
        input_amount: amount.toString(),
        estimated_output: estimatedOutput.toString(),
        direction: aToB ? 'A→B' : 'B→A',
        note: 'This is an estimate. Actual output may vary due to CLMM tick ranges.',
      };
    }

    case 'solana_orca_swap': {
      const wallet = await getSolanaKeypair();
      if (!wallet) throw new Error('SOL_PRIVATE_KEY not set. Required for Solana transactions.');

      const poolPk = new PublicKey(args.pool as string);
      const inputMint = new PublicKey(args.input_mint as string);
      const amountIn = BigInt(args.amount as string);
      const slippageBps = (args.slippage_bps as number) || 100;
      const MEMO_PROGRAM = new PublicKey('MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr');

      const maxAttempts = 3;
      for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        try {
          const info = await connection.getAccountInfo(poolPk);
          if (!info) throw new Error('Pool not found');
          const poolData = parseWhirlpoolData(Buffer.from(info.data));

          const aToB = inputMint.toBase58() === poolData.tokenMintA;
          const mintA = new PublicKey(poolData.tokenMintA);
          const mintB = new PublicKey(poolData.tokenMintB);
          const inputIsSOL = inputMint.equals(NATIVE_MINT);
          const outputMint = aToB ? mintB : mintA;
          const outputIsSOL = outputMint.equals(NATIVE_MINT);

          const ownerAtaA = getAssociatedTokenAddressSync(mintA, wallet.publicKey, false, TOKEN_PROGRAM_ID);
          const ownerAtaB = getAssociatedTokenAddressSync(mintB, wallet.publicKey, false, TOKEN_PROGRAM_ID);
          const vaultA = new PublicKey(poolData.tokenVaultA);
          const vaultB = new PublicKey(poolData.tokenVaultB);
          const oraclePDA = findPDA([Buffer.from('oracle'), poolPk.toBuffer()], WHIRLPOOL_PROGRAM);

          const ts = poolData.tickSpacing as number;
          const currentTick = poolData.tickCurrentIndex as number;
          const arrayStep = TICK_ARRAY_SIZE * ts;

          // Nudge tick on first attempt to avoid boundary issues (SentryBot pattern)
          const swapTick = attempt === 1
            ? (aToB ? currentTick - 1 : currentTick + 1)
            : currentTick;

          const ta0Start = getTickArrayStart(swapTick, ts);
          let ta1Start: number, ta2Start: number;
          if (aToB) {
            ta1Start = ta0Start - arrayStep;
            ta2Start = ta1Start - arrayStep;
          } else {
            ta1Start = ta0Start + arrayStep;
            ta2Start = ta1Start + arrayStep;
          }

          const tickArray0 = findPDA([Buffer.from('tick_array'), poolPk.toBuffer(), Buffer.from(ta0Start.toString())], WHIRLPOOL_PROGRAM);
          const tickArray1 = findPDA([Buffer.from('tick_array'), poolPk.toBuffer(), Buffer.from(ta1Start.toString())], WHIRLPOOL_PROGRAM);
          const tickArray2 = findPDA([Buffer.from('tick_array'), poolPk.toBuffer(), Buffer.from(ta2Start.toString())], WHIRLPOOL_PROGRAM);

          const tx = new Transaction();
          tx.add(ComputeBudgetProgram.setComputeUnitLimit({ units: 400_000 }));
          tx.add(ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 50_000 }));

          // Idempotent ATA creation for both tokens
          tx.add(createAssociatedTokenAccountIdempotentInstruction(wallet.publicKey, ownerAtaA, wallet.publicKey, mintA));
          tx.add(createAssociatedTokenAccountIdempotentInstruction(wallet.publicKey, ownerAtaB, wallet.publicKey, mintB));

          // WSOL wrap: transfer SOL into WSOL ATA then sync
          if (inputIsSOL) {
            const wsolAccount = aToB ? ownerAtaA : ownerAtaB;
            tx.add(SystemProgram.transfer({
              fromPubkey: wallet.publicKey,
              toPubkey: wsolAccount,
              lamports: amountIn,
            }));
            tx.add(createSyncNativeInstruction(wsolAccount));
          }

          // Initialize missing tick arrays (fresh pools only have dynamic tick arrays from LP)
          const initTickArrayDisc = Buffer.from([11, 188, 193, 214, 141, 91, 149, 184]);
          const tickArrayMeta = [
            { pda: tickArray0, start: ta0Start },
            { pda: tickArray1, start: ta1Start },
            { pda: tickArray2, start: ta2Start },
          ];
          const multiInfo = await connection.getMultipleAccountsInfo(tickArrayMeta.map(t => t.pda));
          for (let i = 0; i < tickArrayMeta.length; i++) {
            if (!multiInfo[i]) {
              const initData = Buffer.alloc(8 + 4);
              initTickArrayDisc.copy(initData, 0);
              initData.writeInt32LE(tickArrayMeta[i].start, 8);
              tx.add(new TransactionInstruction({
                programId: WHIRLPOOL_PROGRAM,
                keys: [
                  { pubkey: poolPk, isSigner: false, isWritable: false },
                  { pubkey: wallet.publicKey, isSigner: true, isWritable: true },
                  { pubkey: tickArrayMeta[i].pda, isSigner: false, isWritable: true },
                  { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
                ],
                data: initData,
              }));
            }
          }

          // swap_v2 instruction
          const sqrtPriceLimit = aToB
            ? new BN('4295048016')
            : new BN('79226673515401279992447579055');

          const disc = Buffer.from([43, 4, 237, 11, 26, 201, 30, 98]);
          const swapData = Buffer.alloc(8 + 8 + 8 + 16 + 1 + 1 + 1);
          let o = 0;
          disc.copy(swapData, o); o += 8;
          swapData.writeBigUInt64LE(amountIn, o); o += 8;
          swapData.writeBigUInt64LE(0n, o); o += 8;
          sqrtPriceLimit.toArrayLike(Buffer, 'le', 16).copy(swapData, o); o += 16;
          swapData[o] = 1; o += 1; // amountSpecifiedIsInput
          swapData[o] = aToB ? 1 : 0; o += 1;
          swapData[o] = 0; // remainingAccountsInfo = None

          tx.add(new TransactionInstruction({
            programId: WHIRLPOOL_PROGRAM,
            keys: [
              { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
              { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
              { pubkey: MEMO_PROGRAM, isSigner: false, isWritable: false },
              { pubkey: wallet.publicKey, isSigner: true, isWritable: true },
              { pubkey: poolPk, isSigner: false, isWritable: true },
              { pubkey: mintA, isSigner: false, isWritable: false },
              { pubkey: mintB, isSigner: false, isWritable: false },
              { pubkey: ownerAtaA, isSigner: false, isWritable: true },
              { pubkey: vaultA, isSigner: false, isWritable: true },
              { pubkey: ownerAtaB, isSigner: false, isWritable: true },
              { pubkey: vaultB, isSigner: false, isWritable: true },
              { pubkey: tickArray0, isSigner: false, isWritable: true },
              { pubkey: tickArray1, isSigner: false, isWritable: true },
              { pubkey: tickArray2, isSigner: false, isWritable: true },
              { pubkey: oraclePDA, isSigner: false, isWritable: true },
            ],
            data: swapData,
          }));

          // WSOL unwrap: close WSOL ATA to get native SOL back
          if (outputIsSOL) {
            const wsolAccount = aToB ? ownerAtaB : ownerAtaA;
            tx.add(createCloseAccountInstruction(wsolAccount, wallet.publicKey, wallet.publicKey));
          }

          tx.feePayer = wallet.publicKey;
          const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash('confirmed');
          tx.recentBlockhash = blockhash;
          tx.sign(wallet);

          const sig = await connection.sendRawTransaction(tx.serialize(), { skipPreflight: true, maxRetries: 3 });
          const confirmation = await connection.confirmTransaction({ signature: sig, blockhash, lastValidBlockHeight }, 'confirmed');

          if (confirmation.value.err) {
            throw new Error(`Swap failed on-chain: ${JSON.stringify(confirmation.value.err)}`);
          }

          return {
            signature: sig,
            explorer: `https://solscan.io/tx/${sig}`,
            pool: args.pool,
            input_mint: args.input_mint,
            amount: amountIn.toString(),
            direction: aToB ? 'A→B' : 'B→A',
          };
        } catch (e: any) {
          const msg = `${e?.message || e}`;
          const retryable = msg.includes('TickArraySequenceInvalidIndex') || msg.includes('0x1796') || msg.includes('3012');
          if (!retryable || attempt === maxAttempts) throw e;
          // Wait briefly then retry with different tick alignment
          await new Promise(r => setTimeout(r, 500));
        }
      }
      throw new Error('Swap failed after all retry attempts');
    }

    default:
      throw new Error(`Unknown solana_orca tool: ${name}`);
  }
}
