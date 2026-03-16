import { type Address, maxUint256 } from 'viem';
import { publicClient, getAccount, getWalletClient } from '../client.js';
import { TYDRO_POOL_ABI, TYDRO_DATA_PROVIDER_ABI, TYDRO_ERC20_ABI } from '../abis/Tydro.js';

const TYDRO_POOL           = '0x2816cf15F6d2A220E789aA011D5EE4eB6c47FEbA' as Address;
const TYDRO_DATA_PROVIDER  = '0x96086C25d13943C80Ff9a19791a40Df6aFC08328' as Address;

// 12 live Tydro reserves on Ink
const ASSETS: Record<string, { address: Address; decimals: number }> = {
  WETH:    { address: '0x4200000000000000000000000000000000000006', decimals: 18 },
  kBTC:    { address: '0x73e0c0d45e048d25fc26fa3159b0aa04bfa4db98', decimals: 8  },
  USDT0:   { address: '0x0200C29006150606B650577BBE7B6248F58470c1', decimals: 6  },
  USDG:    { address: '0xe343167631d89b6ffc58b88d6b7fb0228795491d', decimals: 6  },
  GHO:     { address: '0xfc421ad3c883bf9e7c4f42de845c4e4405799e73', decimals: 18 },
  USDC:    { address: '0x2d270e6886d130d724215a266106e6832161eaed', decimals: 6  },
  weETH:   { address: '0xa3d68b74bf0528fdd07263c60d6488749044914b', decimals: 18 },
  wrsETH:  { address: '0x9f0a74a92287e323eb95c1cd9ecdbeb0e397cae4', decimals: 18 },
  ezETH:   { address: '0x2416092f143378750bb29b79ed961ab195cceea5', decimals: 18 },
  sUSDe:   { address: '0x211cc4dd073734da055fbf44a2b4667d5e5fe5d2', decimals: 18 },
  USDe:    { address: '0x5d3a1ff2b6bab83b63cd9ad0787074081a52ef34', decimals: 18 },
  SolvBTC: { address: '0xae4efbc7736f963982aacb17efa37fcbab924cb3', decimals: 18 },
};

function resolveAsset(asset: string): { address: Address; decimals: number } {
  const info = ASSETS[asset.toUpperCase()] ?? ASSETS[asset];
  if (info) return info;
  for (const v of Object.values(ASSETS)) {
    if (v.address.toLowerCase() === asset.toLowerCase()) return v;
  }
  if (asset.startsWith('0x') && asset.length === 42) return { address: asset as Address, decimals: 18 };
  throw new Error(`Unknown asset: ${asset}. Supported: ${Object.keys(ASSETS).join(', ')}`);
}

function rayToAPY(ray: bigint): string {
  const ratePerSecond = Number(ray) / 1e27;
  return (((1 + ratePerSecond) ** 31536000 - 1) * 100).toFixed(4) + '%';
}

function formatUSD(val: bigint): string {
  return '$' + (Number(val) / 1e8).toFixed(2);
}

function parseAmount(amount: string | number, decimals: number): bigint {
  const s = String(amount);
  const [whole, frac = ''] = s.split('.');
  return BigInt(whole) * BigInt(10 ** decimals) + BigInt(frac.padEnd(decimals, '0').slice(0, decimals));
}

async function ensureAllowance(asset: Address, spender: Address, amount: bigint, owner: Address) {
  if (amount === maxUint256) return;
  const allowance = await publicClient.readContract({
    address: asset, abi: TYDRO_ERC20_ABI, functionName: 'allowance', args: [owner, spender],
  });
  if ((allowance as bigint) >= amount) return;
  const wc = await getWalletClient();
  const hash = await wc.writeContract({
    address: asset, abi: TYDRO_ERC20_ABI, functionName: 'approve', args: [spender, maxUint256],
  });
  await publicClient.waitForTransactionReceipt({ hash });
}

export const tydroTools = [
  {
    name: 'tydro_get_reserve_data',
    description: 'Get Tydro (Aave V3 on Ink) reserve data for an asset: supply APY, variable borrow APY, total supplied, total debt, available liquidity, utilization rate.',
    inputSchema: {
      type: 'object' as const,
      properties: { asset: { type: 'string', description: 'Asset symbol (WETH, USDC, kBTC, etc.) or token address' } },
      required: ['asset'],
    },
  },
  {
    name: 'tydro_get_user_account',
    description: "Get a wallet's overall Tydro account: total collateral, total debt, available to borrow, health factor, LTV, liquidation risk.",
    inputSchema: {
      type: 'object' as const,
      properties: { address: { type: 'string', description: 'Wallet address (defaults to agent wallet)' } },
    },
  },
  {
    name: 'tydro_get_user_reserve',
    description: "Get a wallet's position in a specific Tydro reserve: supplied balance, variable debt, stable debt, collateral flag, APYs.",
    inputSchema: {
      type: 'object' as const,
      properties: {
        asset: { type: 'string', description: 'Asset symbol or address' },
        address: { type: 'string', description: 'Wallet address (defaults to agent wallet)' },
      },
      required: ['asset'],
    },
  },
  {
    name: 'tydro_supply',
    description: 'Supply (deposit) an asset to Tydro to earn interest. Auto-approves if needed. Requires EVM_PRIVATE_KEY.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        asset: { type: 'string', description: 'Asset symbol or address' },
        amount: { type: 'string', description: 'Amount to supply (e.g. "1.5")' },
      },
      required: ['asset', 'amount'],
    },
  },
  {
    name: 'tydro_borrow',
    description: 'Borrow an asset from Tydro at variable rate. Requires EVM_PRIVATE_KEY and sufficient collateral.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        asset: { type: 'string', description: 'Asset symbol or address' },
        amount: { type: 'string', description: 'Amount to borrow' },
      },
      required: ['asset', 'amount'],
    },
  },
  {
    name: 'tydro_repay',
    description: 'Repay borrowed assets on Tydro. Use "max" to repay full outstanding debt. Requires EVM_PRIVATE_KEY.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        asset: { type: 'string', description: 'Asset symbol or address' },
        amount: { type: 'string', description: 'Amount to repay, or "max" for full repayment' },
      },
      required: ['asset', 'amount'],
    },
  },
  {
    name: 'tydro_withdraw',
    description: 'Withdraw supplied assets from Tydro. Use "max" for full withdrawal. Requires EVM_PRIVATE_KEY.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        asset: { type: 'string', description: 'Asset symbol or address' },
        amount: { type: 'string', description: 'Amount to withdraw, or "max" for full withdrawal' },
      },
      required: ['asset', 'amount'],
    },
  },
];

export async function handleTydroTool(name: string, args: Record<string, unknown>) {
  switch (name) {

    case 'tydro_get_reserve_data': {
      const { address: assetAddr } = resolveAsset(args.asset as string);
      const d = await publicClient.readContract({
        address: TYDRO_DATA_PROVIDER, abi: TYDRO_DATA_PROVIDER_ABI, functionName: 'getReserveData', args: [assetAddr],
      }) as readonly bigint[];
      const [, , totalAToken, , totalVariableDebt, liquidityRate, variableBorrowRate] = d;
      const avail = totalAToken - totalVariableDebt;
      const util = totalAToken > 0n ? Number(totalVariableDebt * 10000n / totalAToken) / 100 : 0;
      return {
        asset: args.asset,
        supplyAPY: rayToAPY(liquidityRate),
        variableBorrowAPY: rayToAPY(variableBorrowRate),
        totalSupplied: totalAToken.toString(),
        totalDebt: totalVariableDebt.toString(),
        availableLiquidity: avail.toString(),
        utilizationRate: util.toFixed(2) + '%',
      };
    }

    case 'tydro_get_user_account': {
      const addr = ((args.address as Address | undefined) ?? await getAccount());
      const d = await publicClient.readContract({
        address: TYDRO_POOL, abi: TYDRO_POOL_ABI, functionName: 'getUserAccountData', args: [addr],
      }) as readonly bigint[];
      const [totalCollateralBase, totalDebtBase, availableBorrowsBase, threshold, ltv, healthFactor] = d;
      const MAX_HF = BigInt('115792089237316195423570985008687907853269984665640564039457584007913129639935');
      return {
        address: addr,
        totalCollateral: formatUSD(totalCollateralBase),
        totalDebt: formatUSD(totalDebtBase),
        availableToBorrow: formatUSD(availableBorrowsBase),
        liquidationThreshold: (Number(threshold) / 100).toFixed(2) + '%',
        ltv: (Number(ltv) / 100).toFixed(2) + '%',
        healthFactor: healthFactor === MAX_HF ? 'infinite (no debt)' : (Number(healthFactor) / 1e18).toFixed(4),
        liquidationRisk: healthFactor !== MAX_HF && healthFactor < 1100000000000000000n ? 'HIGH — below 1.1' : 'safe',
      };
    }

    case 'tydro_get_user_reserve': {
      const { address: assetAddr, decimals } = resolveAsset(args.asset as string);
      const addr = ((args.address as Address | undefined) ?? await getAccount());
      const d = await publicClient.readContract({
        address: TYDRO_DATA_PROVIDER, abi: TYDRO_DATA_PROVIDER_ABI, functionName: 'getUserReserveData', args: [assetAddr, addr],
      }) as readonly [bigint, bigint, bigint, bigint, bigint, bigint, bigint, number, boolean];
      const [aTokenBal, stableDebt, variableDebt, , , stableBorrowRate, liquidityRate, , collateralEnabled] = d;
      const scale = Number(BigInt(10 ** decimals));
      return {
        asset: args.asset,
        address: addr,
        supplied: (Number(aTokenBal) / scale).toFixed(6),
        stableDebt: (Number(stableDebt) / scale).toFixed(6),
        variableDebt: (Number(variableDebt) / scale).toFixed(6),
        usageAsCollateral: collateralEnabled,
        supplyAPY: rayToAPY(liquidityRate),
        stableBorrowAPY: rayToAPY(stableBorrowRate),
      };
    }

    case 'tydro_supply': {
      const { address: assetAddr, decimals } = resolveAsset(args.asset as string);
      const amount = parseAmount(args.amount as string, decimals);
      const owner = await getAccount();
      await ensureAllowance(assetAddr, TYDRO_POOL, amount, owner);
      const wc = await getWalletClient();
      const hash = await wc.writeContract({
        address: TYDRO_POOL, abi: TYDRO_POOL_ABI, functionName: 'supply', args: [assetAddr, amount, owner, 0],
      });
      const receipt = await publicClient.waitForTransactionReceipt({ hash });
      return { hash, status: receipt.status, asset: args.asset, amount: args.amount };
    }

    case 'tydro_borrow': {
      const { address: assetAddr, decimals } = resolveAsset(args.asset as string);
      const amount = parseAmount(args.amount as string, decimals);
      const owner = await getAccount();
      const wc = await getWalletClient();
      const hash = await wc.writeContract({
        address: TYDRO_POOL, abi: TYDRO_POOL_ABI, functionName: 'borrow', args: [assetAddr, amount, 2n, 0, owner],
      });
      const receipt = await publicClient.waitForTransactionReceipt({ hash });
      return { hash, status: receipt.status, asset: args.asset, amount: args.amount };
    }

    case 'tydro_repay': {
      const { address: assetAddr, decimals } = resolveAsset(args.asset as string);
      const amount = args.amount === 'max' ? maxUint256 : parseAmount(args.amount as string, decimals);
      const owner = await getAccount();
      await ensureAllowance(assetAddr, TYDRO_POOL, amount, owner);
      const wc = await getWalletClient();
      const hash = await wc.writeContract({
        address: TYDRO_POOL, abi: TYDRO_POOL_ABI, functionName: 'repay', args: [assetAddr, amount, 2n, owner],
      });
      const receipt = await publicClient.waitForTransactionReceipt({ hash });
      return { hash, status: receipt.status, asset: args.asset, amount: args.amount };
    }

    case 'tydro_withdraw': {
      const { address: assetAddr, decimals } = resolveAsset(args.asset as string);
      const amount = args.amount === 'max' ? maxUint256 : parseAmount(args.amount as string, decimals);
      const owner = await getAccount();
      const wc = await getWalletClient();
      const hash = await wc.writeContract({
        address: TYDRO_POOL, abi: TYDRO_POOL_ABI, functionName: 'withdraw', args: [assetAddr, amount, owner],
      });
      const receipt = await publicClient.waitForTransactionReceipt({ hash });
      return { hash, status: receipt.status, asset: args.asset, amount: args.amount };
    }

    default:
      throw new Error(`Unknown tydro tool: ${name}`);
  }
}
