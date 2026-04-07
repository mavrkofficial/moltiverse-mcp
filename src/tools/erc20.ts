import { type Address, encodeFunctionData, formatUnits, maxUint256, parseEther } from 'viem';
import { publicClient, getAccount, sendTx } from '../client.js';
import { ERC20ABI } from '../abis/ERC20.js';
import { CONTRACTS } from '../config.js';

const NATIVE = '0x0000000000000000000000000000000000000000';
const WETH9 = CONTRACTS.WETH9 as Address;

// Minimal WETH9 ABI: deposit() payable + withdraw(uint256)
const WETH9_ABI = [
  { name: 'deposit', type: 'function', stateMutability: 'payable', inputs: [], outputs: [] },
  { name: 'withdraw', type: 'function', stateMutability: 'nonpayable', inputs: [{ name: 'wad', type: 'uint256' }], outputs: [] },
] as const;

export const erc20Tools = [
  {
    name: 'erc20_balance',
    description: 'Get token balance for an address. Use token address "0x0000000000000000000000000000000000000000" for native ETH.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        token: { type: 'string', description: 'Token contract address, or 0x0000000000000000000000000000000000000000 for native ETH' },
        owner: { type: 'string', description: 'Address to check balance for (defaults to wallet)' },
      },
      required: ['token'],
    },
  },
  {
    name: 'erc20_allowance',
    description: 'Get current ERC20 allowance for a spender.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        token: { type: 'string', description: 'Token contract address' },
        spender: { type: 'string', description: 'Spender address to check allowance for' },
        owner: { type: 'string', description: 'Owner address (defaults to wallet)' },
      },
      required: ['token', 'spender'],
    },
  },
  {
    name: 'erc20_approve',
    description: 'Approve a spender to use ERC20 tokens. Use amount "max" for unlimited approval.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        token: { type: 'string', description: 'Token contract address' },
        spender: { type: 'string', description: 'Spender address to approve' },
        amount: { type: 'string', description: 'Amount in wei, or "max" for unlimited' },
      },
      required: ['token', 'spender', 'amount'],
    },
  },
  {
    name: 'erc20_transfer',
    description: 'Transfer tokens to an address. Use token address "0x0000000000000000000000000000000000000000" to send native ETH.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        token: { type: 'string', description: 'Token contract address, or 0x0000000000000000000000000000000000000000 for native ETH' },
        to: { type: 'string', description: 'Recipient address' },
        amount: { type: 'string', description: 'Amount in wei' },
      },
      required: ['token', 'to', 'amount'],
    },
  },
  {
    name: 'weth_wrap',
    description: 'Wrap native ETH into WETH on Ink. Sends native ETH as msg.value to the WETH9 contract deposit() function. Use this before tools that require WETH balance: tydro_supply, nado_deposit (with token=WETH), or tsunami_swap_exact_input when you have native ETH but need to swap an existing WETH balance.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        amount: { type: 'string', description: 'Amount of native ETH to wrap, in wei' },
      },
      required: ['amount'],
    },
  },
  {
    name: 'weth_unwrap',
    description: 'Unwrap WETH back into native ETH on Ink. Calls WETH9 withdraw(amount). Use this after withdrawing WETH from Tydro/NADO if you want native ETH back, or to convert any WETH balance.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        amount: { type: 'string', description: 'Amount of WETH to unwrap, in wei. Use "max" to unwrap the full WETH balance.' },
      },
      required: ['amount'],
    },
  },
];

export async function handleErc20Tool(name: string, args: Record<string, unknown>) {
  switch (name) {
    case 'erc20_balance': {
      const token = args.token as Address;
      const owner = (args.owner as Address) ?? await getAccount();
      if (token.toLowerCase() === NATIVE) {
        const balance = await publicClient.getBalance({ address: owner });
        return { balance: balance.toString(), decimals: 18, symbol: 'ETH', formatted: formatUnits(balance, 18), owner };
      }
      const [balance, decimals, symbol] = await Promise.all([
        publicClient.readContract({ address: token, abi: ERC20ABI, functionName: 'balanceOf', args: [owner] }),
        publicClient.readContract({ address: token, abi: ERC20ABI, functionName: 'decimals' }),
        publicClient.readContract({ address: token, abi: ERC20ABI, functionName: 'symbol' }),
      ]);
      return { balance: balance.toString(), decimals, symbol, formatted: formatUnits(balance, decimals), owner };
    }

    case 'erc20_allowance': {
      const token = args.token as Address;
      const owner = (args.owner as Address) ?? await getAccount();
      const spender = args.spender as Address;
      const [allowance, decimals] = await Promise.all([
        publicClient.readContract({ address: token, abi: ERC20ABI, functionName: 'allowance', args: [owner, spender] }),
        publicClient.readContract({ address: token, abi: ERC20ABI, functionName: 'decimals' }),
      ]);
      return { allowance: allowance.toString(), formatted: formatUnits(allowance, decimals), owner, spender };
    }

    case 'erc20_approve': {
      const token = args.token as Address;
      const spender = args.spender as Address;
      const amount = args.amount === 'max' ? maxUint256 : BigInt(args.amount as string);
      const data = encodeFunctionData({
        abi: ERC20ABI, functionName: 'approve', args: [spender, amount],
      });
      const { hash } = await sendTx({ to: token, data });
      const receipt = await publicClient.waitForTransactionReceipt({ hash });
      return { hash, status: receipt.status, spender, amount: amount.toString() };
    }

    case 'erc20_transfer': {
      const token = args.token as Address;
      const to = args.to as Address;
      const amount = BigInt(args.amount as string);
      if (token.toLowerCase() === NATIVE) {
        const { hash } = await sendTx({ to, data: '0x', value: amount });
        const receipt = await publicClient.waitForTransactionReceipt({ hash });
        return { hash, status: receipt.status, to, amount: amount.toString(), native: true };
      }
      const data = encodeFunctionData({
        abi: ERC20ABI, functionName: 'transfer', args: [to, amount],
      });
      const { hash } = await sendTx({ to: token, data });
      const receipt = await publicClient.waitForTransactionReceipt({ hash });
      return { hash, status: receipt.status, to, amount: amount.toString() };
    }

    case 'weth_wrap': {
      const amount = BigInt(args.amount as string);
      const data = encodeFunctionData({ abi: WETH9_ABI, functionName: 'deposit' });
      const { hash } = await sendTx({ to: WETH9, data, value: amount });
      const receipt = await publicClient.waitForTransactionReceipt({ hash });
      if (receipt.status !== 'success') {
        throw new Error(`weth_wrap reverted (tx=${hash})`);
      }
      const owner = await getAccount();
      const newBalance = await publicClient.readContract({
        address: WETH9, abi: ERC20ABI, functionName: 'balanceOf', args: [owner],
      }) as bigint;
      return {
        hash,
        status: receipt.status,
        wrapped: amount.toString(),
        newWethBalance: newBalance.toString(),
        newWethBalanceFormatted: formatUnits(newBalance, 18),
      };
    }

    case 'weth_unwrap': {
      const owner = await getAccount();
      let amount: bigint;
      if (args.amount === 'max') {
        amount = await publicClient.readContract({
          address: WETH9, abi: ERC20ABI, functionName: 'balanceOf', args: [owner],
        }) as bigint;
        if (amount === 0n) {
          throw new Error(`No WETH balance to unwrap (owner=${owner}).`);
        }
      } else {
        amount = BigInt(args.amount as string);
      }
      const data = encodeFunctionData({ abi: WETH9_ABI, functionName: 'withdraw', args: [amount] });
      const { hash } = await sendTx({ to: WETH9, data });
      const receipt = await publicClient.waitForTransactionReceipt({ hash });
      if (receipt.status !== 'success') {
        throw new Error(`weth_unwrap reverted (tx=${hash})`);
      }
      const newEthBalance = await publicClient.getBalance({ address: owner });
      return {
        hash,
        status: receipt.status,
        unwrapped: amount.toString(),
        newEthBalance: newEthBalance.toString(),
        newEthBalanceFormatted: formatUnits(newEthBalance, 18),
      };
    }

    default:
      throw new Error(`Unknown erc20 tool: ${name}`);
  }
}
