import { defineChain } from 'viem';

// ── Ink Chain Definition ──────────────────────────────────────────────
export const ink = defineChain({
  id: 57073,
  name: 'Ink',
  nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
  rpcUrls: {
    default: { http: [process.env.RPC_URL ?? 'https://rpc-gel.inkonchain.com'] },
  },
  blockExplorers: {
    default: { name: 'Ink Explorer', url: 'https://explorer.inkonchain.com' },
  },
});

// ── Contract Addresses ────────────────────────────────────────────────
export const CONTRACTS = {
  TsunamiV3Factory: '0xD8B0826150B7686D1F56d6F10E31E58e1BCF1193',
  TsunamiV3PositionManager: '0x98b6267DA27c5A21Bd6e3edfBC2DA6b0428Fa9F7',
  TsunamiQuoterV2: '0x547D43a6F83A28720908537Aa25179ff8c6A6411',
  TsunamiSwapRouter02: '0x4415F2360bfD9B1bF55500Cb28fA41dF95CB2d2b',
  SentryAgentLaunchFactory: '0x733733E8eAbB94832847AbF0E0EeD6031c3EB2E4',
  Citadel: '0x111474f3062E9B8B7B9d568675c5bb1262d6F862',
  WETH9: '0x4200000000000000000000000000000000000006',
  // ERC-8004 Agent Identity
  IdentityRegistry: '0x7274e874CA62410a93Bd8bf61c69d8045E399c02',           // implementation (active)
  IdentityRegistryProxy: '0x8004A169FB4a3325136EB29fA0ceB6D2e539a432',      // proxy (pending upgrade)
  ReputationRegistry: '0x8004BAa17C55a88189AE136b182e5fdA19dE9b63',
  ValidationRegistry: '0x8004Cc8439f36fd5F9F049D9fF86523Df6dAAB58',
  // DailyGM
  DailyGM: '0x9F500d075118272B3564ac6Ef2c70a9067Fd2d3F',
} as const;

// ── Subgraph ──────────────────────────────────────────────────────────
export const SUBGRAPH_URL = 'https://api.goldsky.com/api/public/project_cmm7vh5xwsa8m01qmdr7w7u62/subgraphs/tsunami-v3/1.0.0/gn';

// ── Constants ─────────────────────────────────────────────────────────
export const DEFAULT_SLIPPAGE_BPS = 50;
export const DEFAULT_DEADLINE_MINUTES = 20;
export const FEE_TIERS = [500, 3000, 10000] as const;
