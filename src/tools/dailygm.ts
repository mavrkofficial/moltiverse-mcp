import { type Address, encodeFunctionData } from 'viem';
import { publicClient, getAccount, sendTx } from '../client.js';
import { CONTRACTS } from '../config.js';
import { DailyGMABI } from '../abis/DailyGM.js';

const DAILY_GM = CONTRACTS.DailyGM as Address;

// ── Tool Definitions ─────────────────────────────────────────────────

export const dailyGmTools = [
  {
    name: 'dailygm_gm',
    description: 'Say GM on-chain. Records a "Good Morning" transaction on the Ink blockchain. Can only be called once per 24 hours.',
    inputSchema: { type: 'object' as const, properties: {} },
  },
  {
    name: 'dailygm_gm_to',
    description: 'Say GM to someone on-chain. Sends a "Good Morning" to a specific wallet address on the Ink blockchain. Can only be called once per 24 hours. Cannot GM yourself.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        recipient: { type: 'string', description: 'Wallet address to send your GM to' },
      },
      required: ['recipient'],
    },
  },
  {
    name: 'dailygm_last_gm',
    description: 'Check when a wallet last said GM on-chain. Returns the unix timestamp of their last GM.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        user: { type: 'string', description: 'Wallet address to check' },
      },
      required: ['user'],
    },
  },
];

// ── Handler ──────────────────────────────────────────────────────────

export async function handleDailyGmTool(name: string, args: Record<string, unknown>) {
  switch (name) {
    case 'dailygm_gm': {
      const sender = await getAccount();
      const data = encodeFunctionData({ abi: DailyGMABI, functionName: 'gm' });
      const { hash } = await sendTx({ to: DAILY_GM, data });
      const receipt = await publicClient.waitForTransactionReceipt({ hash });
      return {
        hash,
        status: receipt.status,
        sender,
        message: receipt.status === 'success' ? 'GM! Recorded on-chain.' : 'GM failed — you may have already GMed in the last 24 hours.',
      };
    }

    case 'dailygm_gm_to': {
      const recipient = args.recipient as Address;
      const sender = await getAccount();
      const data = encodeFunctionData({ abi: DailyGMABI, functionName: 'gmTo', args: [recipient] });
      const { hash } = await sendTx({ to: DAILY_GM, data });
      const receipt = await publicClient.waitForTransactionReceipt({ hash });
      return {
        hash,
        status: receipt.status,
        sender,
        recipient,
        message: receipt.status === 'success' ? `GM sent to ${recipient}!` : 'GM failed — you may have already GMed in the last 24 hours, or tried to GM yourself.',
      };
    }

    case 'dailygm_last_gm': {
      const user = args.user as Address;
      const timestamp = await publicClient.readContract({
        address: DAILY_GM, abi: DailyGMABI, functionName: 'lastGM', args: [user],
      }) as bigint;

      const lastGmUnix = Number(timestamp);
      const neverGmed = lastGmUnix === 0;
      const now = Math.floor(Date.now() / 1000);
      const canGmAgain = neverGmed || now >= lastGmUnix + 86400;

      return {
        user,
        lastGmTimestamp: lastGmUnix,
        lastGmDate: neverGmed ? null : new Date(lastGmUnix * 1000).toISOString(),
        neverGmed,
        canGmAgain,
        secondsUntilNextGm: canGmAgain ? 0 : (lastGmUnix + 86400) - now,
      };
    }

    default:
      throw new Error(`Unknown dailygm tool: ${name}`);
  }
}
