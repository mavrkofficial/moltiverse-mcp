import { type Address, decodeEventLog, encodeFunctionData } from 'viem';
import { publicClient, getAccount, sendTx, serializeBigInts } from '../client.js';
import { CONTRACTS } from '../config.js';
import { SentryLaunchFactoryABI } from '../abis/SentryLaunchFactory.js';

const FACTORY = CONTRACTS.SentryLaunchFactory as Address;

export const sentryTools = [
  {
    name: 'sentry_launch',
    description: 'Permissionless token launch via Sentry. Deploys an ERC20 token, creates a Tsunami V3 pool (1% fee tier), and mints a single-sided LP NFT held permanently inside the factory contract itself (no external locker, no withdraw, no remove-liquidity — only fee collection via sentry_collect_fees). Open to anyone.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        name: { type: 'string', description: 'Token name' },
        symbol: { type: 'string', description: 'Token symbol' },
        baseToken: { type: 'string', description: 'Base pair token address (e.g. WETH)' },
      },
      required: ['name', 'symbol', 'baseToken'],
    },
  },
  {
    name: 'sentry_launch_agent',
    description: 'Agent-only token launch via Sentry. Gated by an ERC-8004 identity NFT on Ink (register via identity_register first). Deploys an ERC20 token, creates a Tsunami V3 pool (1% fee tier), and mints a single-sided LP NFT held permanently inside the factory contract itself (no external locker, no withdraw, no remove-liquidity — only fee collection via sentry_collect_fees).',
    inputSchema: {
      type: 'object' as const,
      properties: {
        name: { type: 'string', description: 'Token name' },
        symbol: { type: 'string', description: 'Token symbol' },
        baseToken: { type: 'string', description: 'Base pair token address (e.g. WETH)' },
      },
      required: ['name', 'symbol', 'baseToken'],
    },
  },
  {
    name: 'sentry_get_creator_nfts',
    description: 'Get all LP NFT IDs for tokens launched by a specific creator address.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        creator: { type: 'string', description: 'Creator address (defaults to wallet)' },
      },
    },
  },
  {
    name: 'sentry_get_token_by_nft',
    description: 'Get the token address associated with an LP NFT ID.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        tokenId: { type: 'string', description: 'LP NFT token ID' },
      },
      required: ['tokenId'],
    },
  },
  {
    name: 'sentry_get_supported_base_tokens',
    description: 'Get list of supported base tokens for launches (e.g. WETH).',
    inputSchema: { type: 'object' as const, properties: {} },
  },
  {
    name: 'sentry_get_total_deployed',
    description: 'Get the total number of tokens deployed through SentryLaunchFactory.',
    inputSchema: { type: 'object' as const, properties: {} },
  },
  {
    name: 'sentry_collect_fees',
    description: 'Collect trading fees from factory-held LP positions. Owner only. Token fees go to treasury; WETH fees route to stakeholder yield wallets based on launch type (regular or agent).',
    inputSchema: {
      type: 'object' as const,
      properties: {
        tokenIds: { type: 'array', items: { type: 'string' }, description: 'Array of LP NFT token IDs' },
      },
      required: ['tokenIds'],
    },
  },
];

export async function handleSentryTool(name: string, args: Record<string, unknown>) {
  switch (name) {
    case 'sentry_launch': {
      const tokenName = args.name as string;
      const symbol = args.symbol as string;
      const baseToken = args.baseToken as Address;

      const data = encodeFunctionData({
        abi: SentryLaunchFactoryABI, functionName: 'launch',
        args: [tokenName, symbol, baseToken],
      });
      const { hash } = await sendTx({ to: FACTORY, data });
      const receipt = await publicClient.waitForTransactionReceipt({ hash });

      // Parse TokenDeployed event
      let tokenAddress: string | undefined;
      let tokenId: string | undefined;
      for (const log of receipt.logs) {
        try {
          const event = decodeEventLog({
            abi: SentryLaunchFactoryABI,
            data: log.data,
            topics: log.topics,
          });
          if (event.eventName === 'TokenDeployed') {
            const eventArgs = event.args as { token: Address; tokenId: bigint };
            tokenAddress = eventArgs.token;
            tokenId = eventArgs.tokenId.toString();
          }
        } catch { /* not our event */ }
      }

      // Register token with MOLTING API (non-fatal)
      const apiBase = process.env.SENTRY_API_BASE || 'https://web-production-7d3e.up.railway.app';
      const apiKey = process.env.MOLTING_API_KEY;
      if (apiKey && tokenAddress) {
        try {
          await fetch(`${apiBase}/api/molting/register-token`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${apiKey}`,
            },
            body: JSON.stringify({
              name: tokenName,
              symbol,
              contractAddress: tokenAddress,
              nftTokenId: tokenId,
              txHash: hash,
            }),
          });
        } catch (_) { /* non-fatal */ }
      }

      return { hash, status: receipt.status, tokenAddress, tokenId };
    }

    case 'sentry_launch_agent': {
      const tokenName = args.name as string;
      const symbol = args.symbol as string;
      const baseToken = args.baseToken as Address;

      const data = encodeFunctionData({
        abi: SentryLaunchFactoryABI, functionName: 'launchAgent',
        args: [tokenName, symbol, baseToken],
      });
      const { hash } = await sendTx({ to: FACTORY, data });
      const receipt = await publicClient.waitForTransactionReceipt({ hash });

      let tokenAddress: string | undefined;
      let tokenId: string | undefined;
      for (const log of receipt.logs) {
        try {
          const event = decodeEventLog({
            abi: SentryLaunchFactoryABI,
            data: log.data,
            topics: log.topics,
          });
          if (event.eventName === 'TokenDeployed') {
            const eventArgs = event.args as { token: Address; tokenId: bigint };
            tokenAddress = eventArgs.token;
            tokenId = eventArgs.tokenId.toString();
          }
        } catch { /* not our event */ }
      }

      const apiBase = process.env.SENTRY_API_BASE || 'https://web-production-7d3e.up.railway.app';
      const apiKey = process.env.MOLTING_API_KEY;
      if (apiKey && tokenAddress) {
        try {
          await fetch(`${apiBase}/api/molting/register-token`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${apiKey}`,
            },
            body: JSON.stringify({
              name: tokenName,
              symbol,
              contractAddress: tokenAddress,
              nftTokenId: tokenId,
              txHash: hash,
              isAgent: true,
            }),
          });
        } catch (_) { /* non-fatal */ }
      }

      return { hash, status: receipt.status, tokenAddress, tokenId };
    }

    case 'sentry_get_creator_nfts': {
      const creator = (args.creator as Address) ?? await getAccount();
      const nfts = await publicClient.readContract({
        address: FACTORY, abi: SentryLaunchFactoryABI, functionName: 'getCreatorNFTs', args: [creator],
      });
      return { creator, nfts: (nfts as bigint[]).map(String) };
    }

    case 'sentry_get_token_by_nft': {
      const tokenId = BigInt(args.tokenId as string);
      const tokenAddress = await publicClient.readContract({
        address: FACTORY, abi: SentryLaunchFactoryABI, functionName: 'getTokenByNFT', args: [tokenId],
      });
      return { tokenId: tokenId.toString(), tokenAddress };
    }

    case 'sentry_get_supported_base_tokens': {
      const tokens = await publicClient.readContract({
        address: FACTORY, abi: SentryLaunchFactoryABI, functionName: 'getSupportedBaseTokens',
      });
      return { baseTokens: tokens };
    }

    case 'sentry_get_total_deployed': {
      const count = await publicClient.readContract({
        address: FACTORY, abi: SentryLaunchFactoryABI, functionName: 'getTotalTokensDeployed',
      });
      return { totalDeployed: count.toString() };
    }

    case 'sentry_collect_fees': {
      const tokenIds = (args.tokenIds as string[]).map(BigInt);
      let data: `0x${string}`;
      if (tokenIds.length === 1) {
        data = encodeFunctionData({
          abi: SentryLaunchFactoryABI, functionName: 'collectFees',
          args: [tokenIds[0]],
        });
      } else {
        data = encodeFunctionData({
          abi: SentryLaunchFactoryABI, functionName: 'collectMultipleFees',
          args: [tokenIds],
        });
      }
      const { hash } = await sendTx({ to: FACTORY, data });
      const receipt = await publicClient.waitForTransactionReceipt({ hash });
      return { hash, status: receipt.status, tokenIds: tokenIds.map(String) };
    }

    default:
      throw new Error(`Unknown sentry tool: ${name}`);
  }
}
