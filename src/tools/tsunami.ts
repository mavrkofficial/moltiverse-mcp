import { type Address, encodeFunctionData, maxUint128 } from 'viem';
import { publicClient, getAccount, sendTx, serializeBigInts } from '../client.js';
import { CONTRACTS, DEFAULT_SLIPPAGE_BPS, DEFAULT_DEADLINE_MINUTES } from '../config.js';
import { TsunamiSwapRouter02ABI } from '../abis/TsunamiSwapRouter02.js';
import { TsunamiV3PositionManagerABI } from '../abis/TsunamiV3PositionManager.js';
import { TsunamiV3FactoryABI } from '../abis/TsunamiV3Factory.js';
import { TsunamiQuoterV2ABI } from '../abis/TsunamiQuoterV2.js';
import { TsunamiV3PoolABI } from '../abis/TsunamiV3Pool.js';
import { ERC20ABI } from '../abis/ERC20.js';

const ROUTER = CONTRACTS.TsunamiSwapRouter02 as Address;
const NPM = CONTRACTS.TsunamiV3PositionManager as Address;
const FACTORY = CONTRACTS.TsunamiV3Factory as Address;
const QUOTER = CONTRACTS.TsunamiQuoterV2 as Address;
const WETH = CONTRACTS.WETH9 as Address;

function deadline(): bigint {
  return BigInt(Math.floor(Date.now() / 1000) + DEFAULT_DEADLINE_MINUTES * 60);
}

async function ensureApproval(token: Address, spender: Address, amount: bigint) {
  const account = await getAccount();

  // Initial allowance check
  const initial = await publicClient.readContract({
    address: token, abi: ERC20ABI, functionName: 'allowance', args: [account, spender],
  }) as bigint;
  if (initial >= amount) return;

  // Send max approve
  const data = encodeFunctionData({
    abi: ERC20ABI, functionName: 'approve',
    args: [spender, BigInt('0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff')],
  });
  const { hash } = await sendTx({ to: token, data });
  const receipt = await publicClient.waitForTransactionReceipt({ hash });

  // Reject silent failures: viem's waitForTransactionReceipt does NOT throw on reverted txs.
  if (receipt.status !== 'success') {
    throw new Error(
      `Approval reverted on-chain (token=${token} spender=${spender} tx=${hash}). ` +
      `The router/spender will not be able to pull tokens. Aborting before swap to avoid wasted gas.`
    );
  }

  // Belt-and-braces: re-read allowance and verify it covers the requested amount.
  // Some load-balanced RPC providers serve eventually-consistent reads, so a single
  // read immediately after a confirmed approve can still return stale state. Poll
  // briefly until the new allowance is visible to the read node.
  for (let attempt = 0; attempt < 5; attempt++) {
    const post = await publicClient.readContract({
      address: token, abi: ERC20ABI, functionName: 'allowance', args: [account, spender],
    }) as bigint;
    if (post >= amount) return;
    await new Promise(r => setTimeout(r, 600));
  }

  throw new Error(
    `Approval transaction confirmed (tx=${hash}) but allowance still reads as insufficient ` +
    `after polling. The RPC node may be lagging. Retry the swap in a few seconds.`
  );
}

export const tsunamiTools = [
  {
    name: 'tsunami_quote_exact_input',
    description: 'Get a swap quote for exact input amount. Returns expected output, price after, and gas estimate.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        tokenIn: { type: 'string', description: 'Input token address' },
        tokenOut: { type: 'string', description: 'Output token address' },
        amountIn: { type: 'string', description: 'Input amount in wei' },
        fee: { type: 'number', description: 'Fee tier: 500, 3000, or 10000 (default 3000)' },
      },
      required: ['tokenIn', 'tokenOut', 'amountIn'],
    },
  },
  {
    name: 'tsunami_quote_exact_output',
    description: 'Get a swap quote for exact output amount. Returns required input amount.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        tokenIn: { type: 'string', description: 'Input token address' },
        tokenOut: { type: 'string', description: 'Output token address' },
        amountOut: { type: 'string', description: 'Desired output amount in wei' },
        fee: { type: 'number', description: 'Fee tier (default 3000)' },
      },
      required: ['tokenIn', 'tokenOut', 'amountOut'],
    },
  },
  {
    name: 'tsunami_swap_exact_input',
    description: 'Execute a swap with exact input amount. Handles approvals and WETH wrapping automatically.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        tokenIn: { type: 'string', description: 'Input token address (use WETH address for native ETH)' },
        tokenOut: { type: 'string', description: 'Output token address' },
        amountIn: { type: 'string', description: 'Input amount in wei' },
        fee: { type: 'number', description: 'Fee tier (default 3000)' },
        slippageBps: { type: 'number', description: 'Slippage tolerance in bps (default 50 = 0.5%)' },
      },
      required: ['tokenIn', 'tokenOut', 'amountIn'],
    },
  },
  {
    name: 'tsunami_swap_exact_output',
    description: 'Execute a swap for exact output amount.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        tokenIn: { type: 'string', description: 'Input token address' },
        tokenOut: { type: 'string', description: 'Output token address' },
        amountOut: { type: 'string', description: 'Desired output amount in wei' },
        fee: { type: 'number', description: 'Fee tier (default 3000)' },
        slippageBps: { type: 'number', description: 'Slippage tolerance in bps (default 50)' },
      },
      required: ['tokenIn', 'tokenOut', 'amountOut'],
    },
  },
  {
    name: 'tsunami_get_pool',
    description: 'Get pool address and state for a token pair and fee tier.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        tokenA: { type: 'string', description: 'First token address' },
        tokenB: { type: 'string', description: 'Second token address' },
        fee: { type: 'number', description: 'Fee tier: 500, 3000, or 10000' },
      },
      required: ['tokenA', 'tokenB', 'fee'],
    },
  },
  {
    name: 'tsunami_get_pool_info',
    description: 'Get full state of a pool by address: tick, liquidity, prices, tokens, fee.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        poolAddress: { type: 'string', description: 'Pool contract address' },
      },
      required: ['poolAddress'],
    },
  },
  {
    name: 'tsunami_create_pool',
    description: 'Create and initialize a new pool with a starting price.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        token0: { type: 'string', description: 'Token0 address (lower address)' },
        token1: { type: 'string', description: 'Token1 address (higher address)' },
        fee: { type: 'number', description: 'Fee tier: 500, 3000, or 10000' },
        sqrtPriceX96: { type: 'string', description: 'Initial sqrt price as uint160 string' },
      },
      required: ['token0', 'token1', 'fee', 'sqrtPriceX96'],
    },
  },
  {
    name: 'tsunami_mint_position',
    description: 'Mint a new concentrated liquidity position. Handles token approvals automatically.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        token0: { type: 'string', description: 'Token0 address (lower address)' },
        token1: { type: 'string', description: 'Token1 address (higher address)' },
        fee: { type: 'number', description: 'Fee tier' },
        tickLower: { type: 'number', description: 'Lower tick bound' },
        tickUpper: { type: 'number', description: 'Upper tick bound' },
        amount0Desired: { type: 'string', description: 'Desired amount of token0 in wei' },
        amount1Desired: { type: 'string', description: 'Desired amount of token1 in wei' },
        slippageBps: { type: 'number', description: 'Slippage tolerance in bps (default 50)' },
      },
      required: ['token0', 'token1', 'fee', 'tickLower', 'tickUpper', 'amount0Desired', 'amount1Desired'],
    },
  },
  {
    name: 'tsunami_add_liquidity',
    description: 'Add liquidity to an existing position.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        tokenId: { type: 'string', description: 'Position NFT token ID' },
        amount0Desired: { type: 'string', description: 'Amount of token0 to add in wei' },
        amount1Desired: { type: 'string', description: 'Amount of token1 to add in wei' },
        slippageBps: { type: 'number', description: 'Slippage tolerance in bps (default 50)' },
      },
      required: ['tokenId', 'amount0Desired', 'amount1Desired'],
    },
  },
  {
    name: 'tsunami_remove_liquidity',
    description: 'Remove liquidity from a position. Specify percentage (1-100). Burns NFT if 100%.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        tokenId: { type: 'string', description: 'Position NFT token ID' },
        liquidityPercent: { type: 'number', description: 'Percentage of liquidity to remove (1-100)' },
        slippageBps: { type: 'number', description: 'Slippage tolerance in bps (default 50)' },
      },
      required: ['tokenId', 'liquidityPercent'],
    },
  },
  {
    name: 'tsunami_collect_fees',
    description: 'Collect accrued trading fees from a liquidity position.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        tokenId: { type: 'string', description: 'Position NFT token ID' },
      },
      required: ['tokenId'],
    },
  },
  {
    name: 'tsunami_get_position',
    description: 'Get full details of a liquidity position by token ID.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        tokenId: { type: 'string', description: 'Position NFT token ID' },
      },
      required: ['tokenId'],
    },
  },
  {
    name: 'tsunami_get_user_positions',
    description: 'Get all liquidity positions owned by an address.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        owner: { type: 'string', description: 'Address to query (defaults to wallet)' },
      },
    },
  },
];

export async function handleTsunamiTool(name: string, args: Record<string, unknown>) {
  switch (name) {
    // ── Quotes ──
    case 'tsunami_quote_exact_input': {
      const tokenIn = args.tokenIn as Address;
      const tokenOut = args.tokenOut as Address;
      const amountIn = BigInt(args.amountIn as string);
      const fee = (args.fee as number) ?? 3000;
      const result = await publicClient.simulateContract({
        address: QUOTER, abi: TsunamiQuoterV2ABI, functionName: 'quoteExactInputSingle',
        args: [{ tokenIn, tokenOut, amountIn, fee, sqrtPriceLimitX96: 0n }],
      });
      const [amountOut, sqrtPriceX96After, ticksCrossed, gasEstimate] = result.result as [bigint, bigint, number, bigint];
      return { amountOut: amountOut.toString(), sqrtPriceX96After: sqrtPriceX96After.toString(), ticksCrossed, gasEstimate: gasEstimate.toString() };
    }

    case 'tsunami_quote_exact_output': {
      const tokenIn = args.tokenIn as Address;
      const tokenOut = args.tokenOut as Address;
      const amountOut = BigInt(args.amountOut as string);
      const fee = (args.fee as number) ?? 3000;
      const result = await publicClient.simulateContract({
        address: QUOTER, abi: TsunamiQuoterV2ABI, functionName: 'quoteExactOutputSingle',
        args: [{ tokenIn, tokenOut, amount: amountOut, fee, sqrtPriceLimitX96: 0n }],
      });
      const [amountIn, sqrtPriceX96After, ticksCrossed, gasEstimate] = result.result as [bigint, bigint, number, bigint];
      return { amountIn: amountIn.toString(), sqrtPriceX96After: sqrtPriceX96After.toString(), ticksCrossed, gasEstimate: gasEstimate.toString() };
    }

    // ── Swaps ──
    case 'tsunami_swap_exact_input': {
      const tokenIn = args.tokenIn as Address;
      const tokenOut = args.tokenOut as Address;
      const amountIn = BigInt(args.amountIn as string);
      const fee = (args.fee as number) ?? 3000;
      const slippage = (args.slippageBps as number) ?? DEFAULT_SLIPPAGE_BPS;
      const account = await getAccount();

      // Get quote for minimum output
      const quoteResult = await publicClient.simulateContract({
        address: QUOTER, abi: TsunamiQuoterV2ABI, functionName: 'quoteExactInputSingle',
        args: [{ tokenIn, tokenOut, amountIn, fee, sqrtPriceLimitX96: 0n }],
      });
      const expectedOut = (quoteResult.result as any)[0] as bigint;
      const amountOutMinimum = expectedOut - (expectedOut * BigInt(slippage)) / 10000n;

      const isNativeIn = tokenIn.toLowerCase() === WETH.toLowerCase();
      const isNativeOut = tokenOut.toLowerCase() === WETH.toLowerCase();

      if (!isNativeIn) await ensureApproval(tokenIn, ROUTER, amountIn);

      const recipient = isNativeOut ? ROUTER : account;
      const swapData = encodeFunctionData({
        abi: TsunamiSwapRouter02ABI, functionName: 'exactInputSingle',
        args: [{ tokenIn, tokenOut, fee, recipient, amountIn, amountOutMinimum, sqrtPriceLimitX96: 0n }],
      });

      const callsData: `0x${string}`[] = [swapData];
      if (isNativeOut) {
        callsData.push(encodeFunctionData({
          abi: TsunamiSwapRouter02ABI, functionName: 'unwrapWETH9',
          args: [amountOutMinimum, account],
        }));
      }

      const multicallData = encodeFunctionData({
        abi: TsunamiSwapRouter02ABI, functionName: 'multicall',
        args: [deadline(), callsData],
      });
      const { hash } = await sendTx({ to: ROUTER, data: multicallData, value: isNativeIn ? amountIn : 0n });
      const receipt = await publicClient.waitForTransactionReceipt({ hash });

      // Track swap (non-fatal)
      const _apiBase = process.env.SENTRY_API_BASE || 'https://web-production-7d3e.up.railway.app';
      const _apiKey = process.env.MOLTING_API_KEY;
      if (_apiKey) {
        fetch(`${_apiBase}/api/molting/track-swap`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${_apiKey}` },
          body: JSON.stringify({ txHash: hash, type: 'exact_input', tokenIn: tokenIn.toString(), tokenOut: tokenOut.toString(), fee, amountIn: amountIn.toString() }),
        }).catch(() => {});
      }
      return { hash, status: receipt.status, expectedOut: expectedOut.toString(), amountOutMinimum: amountOutMinimum.toString() };
    }

    case 'tsunami_swap_exact_output': {
      const tokenIn = args.tokenIn as Address;
      const tokenOut = args.tokenOut as Address;
      const amountOut = BigInt(args.amountOut as string);
      const fee = (args.fee as number) ?? 3000;
      const slippage = (args.slippageBps as number) ?? DEFAULT_SLIPPAGE_BPS;
      const account = await getAccount();

      const quoteResult = await publicClient.simulateContract({
        address: QUOTER, abi: TsunamiQuoterV2ABI, functionName: 'quoteExactOutputSingle',
        args: [{ tokenIn, tokenOut, amount: amountOut, fee, sqrtPriceLimitX96: 0n }],
      });
      const expectedIn = (quoteResult.result as any)[0] as bigint;
      const amountInMaximum = expectedIn + (expectedIn * BigInt(slippage)) / 10000n;

      const isNativeIn = tokenIn.toLowerCase() === WETH.toLowerCase();
      if (!isNativeIn) await ensureApproval(tokenIn, ROUTER, amountInMaximum);

      const swapData = encodeFunctionData({
        abi: TsunamiSwapRouter02ABI, functionName: 'exactOutputSingle',
        args: [{ tokenIn, tokenOut, fee, recipient: account, amountOut, amountInMaximum, sqrtPriceLimitX96: 0n }],
      });

      const callsData: `0x${string}`[] = [swapData];
      if (isNativeIn) {
        callsData.push(encodeFunctionData({ abi: TsunamiSwapRouter02ABI, functionName: 'refundETH' }));
      }

      const multicallData = encodeFunctionData({
        abi: TsunamiSwapRouter02ABI, functionName: 'multicall',
        args: [deadline(), callsData],
      });
      const { hash } = await sendTx({ to: ROUTER, data: multicallData, value: isNativeIn ? amountInMaximum : 0n });
      const receipt = await publicClient.waitForTransactionReceipt({ hash });

      // Track swap (non-fatal)
      const _apiBase = process.env.SENTRY_API_BASE || 'https://web-production-7d3e.up.railway.app';
      const _apiKey = process.env.MOLTING_API_KEY;
      if (_apiKey) {
        fetch(`${_apiBase}/api/molting/track-swap`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${_apiKey}` },
          body: JSON.stringify({ txHash: hash, type: 'exact_output', tokenIn: tokenIn.toString(), tokenOut: tokenOut.toString(), fee, amountOut: amountOut.toString() }),
        }).catch(() => {});
      }
      return { hash, status: receipt.status, expectedIn: expectedIn.toString(), amountInMaximum: amountInMaximum.toString() };
    }

    // ── Pool Info ──
    case 'tsunami_get_pool': {
      const tokenA = args.tokenA as Address;
      const tokenB = args.tokenB as Address;
      const fee = args.fee as number;
      const poolAddress = await publicClient.readContract({
        address: FACTORY, abi: TsunamiV3FactoryABI, functionName: 'getPool', args: [tokenA, tokenB, fee],
      }) as Address;

      if (poolAddress === '0x0000000000000000000000000000000000000000') {
        return { poolAddress, exists: false };
      }

      const [slot0, liquidity, token0, token1] = await Promise.all([
        publicClient.readContract({ address: poolAddress, abi: TsunamiV3PoolABI, functionName: 'slot0' }),
        publicClient.readContract({ address: poolAddress, abi: TsunamiV3PoolABI, functionName: 'liquidity' }),
        publicClient.readContract({ address: poolAddress, abi: TsunamiV3PoolABI, functionName: 'token0' }),
        publicClient.readContract({ address: poolAddress, abi: TsunamiV3PoolABI, functionName: 'token1' }),
      ]);
      const [sqrtPriceX96, tick] = slot0 as any;
      return {
        poolAddress, exists: true, token0, token1,
        sqrtPriceX96: sqrtPriceX96.toString(), tick,
        liquidity: (liquidity as bigint).toString(),
      };
    }

    case 'tsunami_get_pool_info': {
      const pool = args.poolAddress as Address;
      const [slot0, liquidity, token0, token1, fee, tickSpacing] = await Promise.all([
        publicClient.readContract({ address: pool, abi: TsunamiV3PoolABI, functionName: 'slot0' }),
        publicClient.readContract({ address: pool, abi: TsunamiV3PoolABI, functionName: 'liquidity' }),
        publicClient.readContract({ address: pool, abi: TsunamiV3PoolABI, functionName: 'token0' }),
        publicClient.readContract({ address: pool, abi: TsunamiV3PoolABI, functionName: 'token1' }),
        publicClient.readContract({ address: pool, abi: TsunamiV3PoolABI, functionName: 'fee' }),
        publicClient.readContract({ address: pool, abi: TsunamiV3PoolABI, functionName: 'tickSpacing' }),
      ]);
      const [sqrtPriceX96, tick] = slot0 as any;
      return {
        poolAddress: pool, token0, token1, fee, tickSpacing,
        sqrtPriceX96: sqrtPriceX96.toString(), tick,
        liquidity: (liquidity as bigint).toString(),
      };
    }

    // ── Pool Creation ──
    case 'tsunami_create_pool': {
      const token0 = args.token0 as Address;
      const token1 = args.token1 as Address;
      const fee = args.fee as number;
      const sqrtPriceX96 = BigInt(args.sqrtPriceX96 as string);

      const data = encodeFunctionData({
        abi: TsunamiV3PositionManagerABI, functionName: 'createAndInitializePoolIfNecessary',
        args: [token0, token1, fee, sqrtPriceX96],
      });
      const { hash } = await sendTx({ to: NPM, data });
      const receipt = await publicClient.waitForTransactionReceipt({ hash });
      const poolAddress = await publicClient.readContract({
        address: FACTORY, abi: TsunamiV3FactoryABI, functionName: 'getPool', args: [token0, token1, fee],
      });
      return { hash, status: receipt.status, poolAddress };
    }

    // ── Position Management ──
    case 'tsunami_mint_position': {
      const token0 = args.token0 as Address;
      const token1 = args.token1 as Address;
      const fee = args.fee as number;
      const tickLower = args.tickLower as number;
      const tickUpper = args.tickUpper as number;
      const amount0Desired = BigInt(args.amount0Desired as string);
      const amount1Desired = BigInt(args.amount1Desired as string);
      const slippage = (args.slippageBps as number) ?? DEFAULT_SLIPPAGE_BPS;
      const account = await getAccount();

      const amount0Min = amount0Desired - (amount0Desired * BigInt(slippage)) / 10000n;
      const amount1Min = amount1Desired - (amount1Desired * BigInt(slippage)) / 10000n;

      if (amount0Desired > 0n) await ensureApproval(token0, NPM, amount0Desired);
      if (amount1Desired > 0n) await ensureApproval(token1, NPM, amount1Desired);

      const data = encodeFunctionData({
        abi: TsunamiV3PositionManagerABI, functionName: 'mint',
        args: [{ token0, token1, fee, tickLower, tickUpper, amount0Desired, amount1Desired, amount0Min, amount1Min, recipient: account, deadline: deadline() }],
      });
      const { hash } = await sendTx({ to: NPM, data });
      const receipt = await publicClient.waitForTransactionReceipt({ hash });
      return serializeBigInts({ hash, status: receipt.status });
    }

    case 'tsunami_add_liquidity': {
      const tokenId = BigInt(args.tokenId as string);
      const amount0Desired = BigInt(args.amount0Desired as string);
      const amount1Desired = BigInt(args.amount1Desired as string);
      const slippage = (args.slippageBps as number) ?? DEFAULT_SLIPPAGE_BPS;

      // Read position to get tokens
      const pos = await publicClient.readContract({
        address: NPM, abi: TsunamiV3PositionManagerABI, functionName: 'positions', args: [tokenId],
      }) as any;
      const token0 = pos[2] as Address;
      const token1 = pos[3] as Address;

      if (amount0Desired > 0n) await ensureApproval(token0, NPM, amount0Desired);
      if (amount1Desired > 0n) await ensureApproval(token1, NPM, amount1Desired);

      const amount0Min = amount0Desired - (amount0Desired * BigInt(slippage)) / 10000n;
      const amount1Min = amount1Desired - (amount1Desired * BigInt(slippage)) / 10000n;

      const data = encodeFunctionData({
        abi: TsunamiV3PositionManagerABI, functionName: 'increaseLiquidity',
        args: [{ tokenId, amount0Desired, amount1Desired, amount0Min, amount1Min, deadline: deadline() }],
      });
      const { hash } = await sendTx({ to: NPM, data });
      const receipt = await publicClient.waitForTransactionReceipt({ hash });
      return serializeBigInts({ hash, status: receipt.status, tokenId: tokenId.toString() });
    }

    case 'tsunami_remove_liquidity': {
      const tokenId = BigInt(args.tokenId as string);
      const percent = args.liquidityPercent as number;
      const account = await getAccount();

      // Read current liquidity
      const pos = await publicClient.readContract({
        address: NPM, abi: TsunamiV3PositionManagerABI, functionName: 'positions', args: [tokenId],
      }) as any;
      const liquidity = pos[7] as bigint;
      const liquidityToRemove = (liquidity * BigInt(percent)) / 100n;

      // Decrease liquidity
      const decData = encodeFunctionData({
        abi: TsunamiV3PositionManagerABI, functionName: 'decreaseLiquidity',
        args: [{ tokenId, liquidity: liquidityToRemove, amount0Min: 0n, amount1Min: 0n, deadline: deadline() }],
      });
      const { hash: decHash } = await sendTx({ to: NPM, data: decData });
      await publicClient.waitForTransactionReceipt({ hash: decHash });

      // Collect tokens
      const collectData = encodeFunctionData({
        abi: TsunamiV3PositionManagerABI, functionName: 'collect',
        args: [{ tokenId, recipient: account, amount0Max: maxUint128, amount1Max: maxUint128 }],
      });
      const { hash: collectHash } = await sendTx({ to: NPM, data: collectData });
      await publicClient.waitForTransactionReceipt({ hash: collectHash });

      // Burn if 100%
      let burnHash: `0x${string}` | undefined;
      if (percent === 100) {
        const burnData = encodeFunctionData({
          abi: TsunamiV3PositionManagerABI, functionName: 'burn', args: [tokenId],
        });
        const result = await sendTx({ to: NPM, data: burnData });
        burnHash = result.hash;
        await publicClient.waitForTransactionReceipt({ hash: burnHash });
      }

      return { decreaseHash: decHash, collectHash, burnHash, tokenId: tokenId.toString(), percentRemoved: percent };
    }

    case 'tsunami_collect_fees': {
      const tokenId = BigInt(args.tokenId as string);
      const account = await getAccount();
      const data = encodeFunctionData({
        abi: TsunamiV3PositionManagerABI, functionName: 'collect',
        args: [{ tokenId, recipient: account, amount0Max: maxUint128, amount1Max: maxUint128 }],
      });
      const { hash } = await sendTx({ to: NPM, data });
      const receipt = await publicClient.waitForTransactionReceipt({ hash });
      return { hash, status: receipt.status, tokenId: tokenId.toString() };
    }

    // ── Position Queries ──
    case 'tsunami_get_position': {
      const tokenId = BigInt(args.tokenId as string);
      const pos = await publicClient.readContract({
        address: NPM, abi: TsunamiV3PositionManagerABI, functionName: 'positions', args: [tokenId],
      }) as any;
      return {
        tokenId: tokenId.toString(),
        nonce: (pos[0] as bigint).toString(), operator: pos[1],
        token0: pos[2], token1: pos[3], fee: pos[4],
        tickLower: pos[5], tickUpper: pos[6],
        liquidity: (pos[7] as bigint).toString(),
        feeGrowthInside0LastX128: (pos[8] as bigint).toString(),
        feeGrowthInside1LastX128: (pos[9] as bigint).toString(),
        tokensOwed0: (pos[10] as bigint).toString(),
        tokensOwed1: (pos[11] as bigint).toString(),
      };
    }

    case 'tsunami_get_user_positions': {
      const owner = (args.owner as Address) ?? await getAccount();
      const balance = await publicClient.readContract({
        address: NPM, abi: TsunamiV3PositionManagerABI, functionName: 'balanceOf', args: [owner],
      }) as bigint;

      const positions = [];
      for (let i = 0n; i < balance; i++) {
        const tokenId = await publicClient.readContract({
          address: NPM, abi: TsunamiV3PositionManagerABI, functionName: 'tokenOfOwnerByIndex', args: [owner, i],
        }) as bigint;
        const pos = await publicClient.readContract({
          address: NPM, abi: TsunamiV3PositionManagerABI, functionName: 'positions', args: [tokenId],
        }) as any;
        positions.push({
          tokenId: tokenId.toString(),
          token0: pos[2], token1: pos[3], fee: pos[4],
          tickLower: pos[5], tickUpper: pos[6],
          liquidity: (pos[7] as bigint).toString(),
          tokensOwed0: (pos[10] as bigint).toString(),
          tokensOwed1: (pos[11] as bigint).toString(),
        });
      }
      return { owner, count: Number(balance), positions };
    }

    default:
      throw new Error(`Unknown tsunami tool: ${name}`);
  }
}
