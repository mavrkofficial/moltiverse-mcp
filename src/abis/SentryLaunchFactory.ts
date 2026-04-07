export const SentryLaunchFactoryABI = [
  // ── Launch (permissionless) ──
  {
    type: "function", name: "launch", stateMutability: "nonpayable",
    inputs: [{ name: "_name", type: "string" }, { name: "_symbol", type: "string" }, { name: "baseToken", type: "address" }],
    outputs: [{ name: "tokenAddress", type: "address" }, { name: "tokenId", type: "uint256" }],
  },
  // ── Launch Agent (requires ERC-8004 identity NFT) ──
  {
    type: "function", name: "launchAgent", stateMutability: "nonpayable",
    inputs: [{ name: "_name", type: "string" }, { name: "_symbol", type: "string" }, { name: "baseToken", type: "address" }],
    outputs: [{ name: "tokenAddress", type: "address" }, { name: "tokenId", type: "uint256" }],
  },
  // ── Fee Collection (owner only) ──
  {
    type: "function", name: "collectFees", stateMutability: "nonpayable",
    inputs: [{ name: "tokenId", type: "uint256" }], outputs: [],
  },
  {
    type: "function", name: "collectMultipleFees", stateMutability: "nonpayable",
    inputs: [{ name: "tokenIds", type: "uint256[]" }], outputs: [],
  },
  // ── View Functions ──
  {
    type: "function", name: "getCreatorNFTs", stateMutability: "view",
    inputs: [{ name: "creator", type: "address" }], outputs: [{ name: "", type: "uint256[]" }],
  },
  {
    type: "function", name: "getTokenByNFT", stateMutability: "view",
    inputs: [{ name: "tokenId", type: "uint256" }], outputs: [{ name: "", type: "address" }],
  },
  {
    type: "function", name: "getSupportedBaseTokens", stateMutability: "view",
    inputs: [], outputs: [{ name: "", type: "address[]" }],
  },
  {
    type: "function", name: "getTotalTokensDeployed", stateMutability: "view",
    inputs: [], outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "function", name: "getCreator", stateMutability: "view",
    inputs: [{ name: "tokenId", type: "uint256" }], outputs: [{ name: "", type: "address" }],
  },
  {
    type: "function", name: "getCreatorNFTCount", stateMutability: "view",
    inputs: [{ name: "creator", type: "address" }], outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "function", name: "getPoolManager", stateMutability: "view",
    inputs: [{ name: "baseToken", type: "address" }], outputs: [{ name: "", type: "address" }],
  },
  {
    type: "function", name: "getTrustedForwarder", stateMutability: "view",
    inputs: [], outputs: [{ name: "", type: "address" }],
  },
  {
    type: "function", name: "isAgentPosition", stateMutability: "view",
    inputs: [{ name: "tokenId", type: "uint256" }], outputs: [{ name: "", type: "bool" }],
  },
  {
    type: "function", name: "feesWalletRegular", stateMutability: "view",
    inputs: [], outputs: [{ name: "", type: "address" }],
  },
  {
    type: "function", name: "feesWalletAgent", stateMutability: "view",
    inputs: [], outputs: [{ name: "", type: "address" }],
  },
  {
    type: "function", name: "identityRegistry", stateMutability: "view",
    inputs: [], outputs: [{ name: "", type: "address" }],
  },
  {
    type: "function", name: "treasury", stateMutability: "view",
    inputs: [], outputs: [{ name: "", type: "address" }],
  },
  {
    type: "function", name: "npm", stateMutability: "view",
    inputs: [], outputs: [{ name: "", type: "address" }],
  },
  {
    type: "function", name: "owner", stateMutability: "view",
    inputs: [], outputs: [{ name: "", type: "address" }],
  },
  {
    type: "function", name: "totalTokensDeployed", stateMutability: "view",
    inputs: [], outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "function", name: "citadel", stateMutability: "view",
    inputs: [], outputs: [{ name: "", type: "address" }],
  },
  // ── Events ──
  {
    type: "event", name: "TokenDeployed", anonymous: false,
    inputs: [
      { name: "token", type: "address", indexed: true },
      { name: "name", type: "string", indexed: false },
      { name: "symbol", type: "string", indexed: false },
      { name: "creator", type: "address", indexed: true },
      { name: "tokenId", type: "uint256", indexed: false },
    ],
  },
  {
    type: "event", name: "FeesCollected", anonymous: false,
    inputs: [
      { name: "tokenId", type: "uint256", indexed: true },
      { name: "amount0", type: "uint256", indexed: false },
      { name: "amount1", type: "uint256", indexed: false },
    ],
  },
  {
    type: "event", name: "LiquidityMinted", anonymous: false,
    inputs: [
      { name: "tokenId", type: "uint256", indexed: true },
      { name: "pool", type: "address", indexed: true },
      { name: "token", type: "address", indexed: true },
    ],
  },
  {
    type: "event", name: "LPLocked", anonymous: false,
    inputs: [
      { name: "tokenId", type: "uint256", indexed: true },
      { name: "pool", type: "address", indexed: true },
      { name: "token", type: "address", indexed: true },
    ],
  },
  {
    type: "event", name: "BaseTokenAdded", anonymous: false,
    inputs: [
      { name: "baseToken", type: "address", indexed: true },
      { name: "manager", type: "address", indexed: true },
    ],
  },
  {
    type: "event", name: "BaseTokenRemoved", anonymous: false,
    inputs: [{ name: "baseToken", type: "address", indexed: true }],
  },
  {
    type: "event", name: "PoolManagerUpdated", anonymous: false,
    inputs: [
      { name: "baseToken", type: "address", indexed: true },
      { name: "oldManager", type: "address", indexed: false },
      { name: "newManager", type: "address", indexed: false },
    ],
  },
  {
    type: "event", name: "TreasuryUpdated", anonymous: false,
    inputs: [
      { name: "oldTreasury", type: "address", indexed: false },
      { name: "newTreasury", type: "address", indexed: false },
    ],
  },
  {
    type: "event", name: "CitadelUpdated", anonymous: false,
    inputs: [
      { name: "oldCitadel", type: "address", indexed: false },
      { name: "newCitadel", type: "address", indexed: false },
    ],
  },
  {
    type: "event", name: "CitadelLockFailed", anonymous: false,
    inputs: [
      { name: "tokenId", type: "uint256", indexed: true },
      { name: "reason", type: "bytes", indexed: false },
    ],
  },
  {
    type: "event", name: "IdentityRegistryUpdated", anonymous: false,
    inputs: [
      { name: "oldRegistry", type: "address", indexed: false },
      { name: "newRegistry", type: "address", indexed: false },
    ],
  },
  {
    type: "event", name: "FeeWalletsUpdated", anonymous: false,
    inputs: [
      { name: "oldRegularWallet", type: "address", indexed: false },
      { name: "newRegularWallet", type: "address", indexed: false },
      { name: "oldAgentWallet", type: "address", indexed: false },
      { name: "newAgentWallet", type: "address", indexed: false },
    ],
  },
  {
    type: "event", name: "PoolInitialized", anonymous: false,
    inputs: [
      { name: "pool", type: "address", indexed: true },
      { name: "token", type: "address", indexed: true },
    ],
  },
] as const;
