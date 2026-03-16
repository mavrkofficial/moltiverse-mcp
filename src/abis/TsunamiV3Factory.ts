export const TsunamiV3FactoryABI = [
  {
    type: "function", name: "getPool", stateMutability: "view",
    inputs: [{ name: "tokenA", type: "address" }, { name: "tokenB", type: "address" }, { name: "fee", type: "uint24" }],
    outputs: [{ name: "pool", type: "address" }],
  },
  {
    type: "function", name: "createPool", stateMutability: "nonpayable",
    inputs: [{ name: "tokenA", type: "address" }, { name: "tokenB", type: "address" }, { name: "fee", type: "uint24" }],
    outputs: [{ name: "pool", type: "address" }],
  },
  {
    type: "function", name: "feeAmountTickSpacing", stateMutability: "view",
    inputs: [{ name: "fee", type: "uint24" }],
    outputs: [{ name: "tickSpacing", type: "int24" }],
  },
  {
    type: "function", name: "owner", stateMutability: "view",
    inputs: [], outputs: [{ name: "", type: "address" }],
  },
  {
    type: "event", name: "PoolCreated", anonymous: false,
    inputs: [
      { name: "token0", type: "address", indexed: true },
      { name: "token1", type: "address", indexed: true },
      { name: "fee", type: "uint24", indexed: true },
      { name: "tickSpacing", type: "int24", indexed: false },
      { name: "pool", type: "address", indexed: false },
    ],
  },
] as const;
