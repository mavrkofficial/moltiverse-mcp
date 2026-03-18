export const DailyGMABI = [
  // ── Write Functions ──
  { type: "function", name: "gm", stateMutability: "nonpayable", inputs: [], outputs: [] },
  { type: "function", name: "gmTo", stateMutability: "nonpayable", inputs: [{ name: "recipient", type: "address" }], outputs: [] },
  // ── View Functions ──
  { type: "function", name: "lastGM", stateMutability: "view", inputs: [{ name: "user", type: "address" }], outputs: [{ name: "lastGM", type: "uint256" }] },
  // ── Events ──
  { type: "event", name: "GM", inputs: [{ name: "user", type: "address", indexed: true }, { name: "recipient", type: "address", indexed: true }] },
] as const;
