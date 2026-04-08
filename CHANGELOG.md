# Changelog

All notable changes to this project will be documented in this file.

## [1.14.2] — 2026-04-08

### Changed
- **`relay_execute` now supports any EVM chain or Solana mainnet as origin**, dramatically expanding the cross-chain surface area. Previous version was Ink-only.

  Supported origins (any chain the configured wallet can sign for):
  - **Any of the 60+ EVM chains** in `viem/chains` — Ink, Base, Arbitrum, Optimism, Ethereum mainnet, Polygon, BNB, Avalanche, Linea, Scroll, zkSync, Blast, Berachain, Mantle, etc. The same locally-held EVM private key signs for every chain because addresses are derived deterministically from the keypair (your Ink address IS your Base address IS your Arbitrum address).
  - **Solana mainnet** (`792703809`) via the configured Solana keypair.

  Supported destinations: any of the 70+ chains Relay supports.

  Useful flows now possible end-to-end through the MCP:
  - `SOL → ETH on Ink` (cross-VM bridge in)
  - `SOL → USDC on Ethereum mainnet` (Solana to EVM L1)
  - `Ink ETH → Base ETH` (EVM L2 to L2 without ever touching mainnet)
  - `Arbitrum USDC → Ink USDT0` (cross-L2 stable rebalance)
  - Same-chain swaps on any supported chain when local DEX liquidity is thin

  New optional arguments: `originChainId` (default `57073` = Ink) and `destinationChainId` (defaults to same as origin for single-chain swaps).

  Per-chain RPC URLs default to viem's baked-in defaults but can be overridden via the new `EVM_RPC_OVERRIDES` env var (JSON map from chainId to RPC URL):
  ```
  EVM_RPC_OVERRIDES='{"8453":"https://base-mainnet.infura.io/v3/...","42161":"https://arb1.arbitrum.io/rpc"}'
  ```

  Cross-chain bridges originating from non-EVM/non-Solana VMs (Bitcoin, Tron, Hyperliquid, Lighter) and from SVM chains other than Solana mainnet (Eclipse, SOON) are still unsupported — use `relay_get_quote` and submit the origin tx externally for those.

  Implementation details:
  - **EVM origin path**: each Relay step item carries its own `chainId`. The handler dynamically creates a `WalletClient` and `PublicClient` per step using new `getWalletClientForChain(chainId)` / `sendTxOnChain(chainId, ...)` helpers in `client.ts`, which look up the chain definition from `viem/chains` and broadcast via that chain's RPC. PublicClient instances are cached per chain ID within a single execution to avoid recreating them for each item.
  - **Solana origin path**: Relay returns raw instructions + address-lookup-table addresses in `quote.steps[].items[].data` rather than a prebuilt transaction. The handler converts those into `TransactionInstruction` objects, fetches the referenced ALTs from chain, compiles a v0 `VersionedTransaction`, signs with `getSolanaKeypair()`, and submits via the Helius `Connection`.
  - **Default recipient picker**: SVM destinations get the configured Solana pubkey, EVM destinations get the configured EVM address (same across all EVM chains). Non-EVM/non-SVM destinations require explicit `recipient`.
  - Response shape now includes a `chain` field (`'evm'` | `'solana'`) and `chainId` on each submitted tx, plus an `explorer` link that picks the right block explorer based on the destination chain (Inkscan for Ink, Solscan for Solana, the chain's default explorer from `viem/chains` for everything else), and a `statusCheck` URL for polling the Relay intent status endpoint.

### Added
- New helpers in `src/client.ts`: `getChainByChainId(chainId)`, `getPublicClientForChain(chainId)`, `getWalletClientForChain(chainId)`, `sendTxOnChain(chainId, params)`. All other modules (Tydro, Tsunami, NADO, Sentry, etc.) continue to use the existing static Ink-only clients — only `relay_execute` opted into the dynamic multi-chain path.
- New env var: `EVM_RPC_OVERRIDES` (JSON map). Optional. Override the default RPC URL for any EVM chain. Useful when you have private RPCs for chains other than Ink.

## [1.14.1] — 2026-04-07

### Fixed
- **`weth_wrap` and `weth_unwrap` returning "Unknown tool"** despite appearing in the tool listing. Root cause: the tools were registered in `erc20Tools` but the router in `src/index.ts` only matched `name.startsWith('erc20_')`, so calls to `weth_wrap` / `weth_unwrap` fell through to the unknown-tool error. Added `if (name.startsWith('weth_')) return handleErc20Tool(...)` next to the erc20 line. **This was a critical v1.14.0 ship bug — every Tydro/NADO native-ETH workflow was broken without these helpers.**
- **`tydro_get_reserve_data` returning `Infinity%` for any utilized reserve and `0.0000%` for idle reserves.** The `rayToAPY` helper treated Aave's RAY-encoded **annual** rate (APR) as a per-second rate, then exponentiated it 31,536,000 times, giving `(1 + APR)^secondsPerYear` ≈ infinity for any nonzero APR. Replaced with the correct APR→APY conversion: `(1 + APR/secondsPerYear)^secondsPerYear - 1`.
- **`solana_orca_swap` returning `"[object Object]"`** in error responses on certain failure paths. The catch block was passing the raw error object to `JSON.stringify` instead of extracting `.message` first. Now produces a real string message with the underlying revert reason or program error.

### Added
- **`solana_jupiter_quote` and `solana_jupiter_swap` tools** — execute Solana swaps via the Jupiter v6 aggregator instead of building Whirlpool `swap_v2` instructions by hand. Routes across every Solana DEX (Orca, Raydium, Meteora, Phoenix, etc.) and handles tick array initialization, ATA creation, and SOL wrap/unwrap internally. **This is the canonical Solana swap path going forward.** `solana_orca_swap` is still available but its description now points users at Jupiter and warns about the fragility of the direct path against newly-launched single-sided LP pools (where it returns `TickArraySequenceInvalidIndex` when the swap walks beyond pre-initialized tick arrays).
- **`relay_execute` tool** — actually execute a same-chain swap on Ink via Relay Protocol routing, not just fetch a quote. Useful when Tsunami pools lack liquidity (e.g. ETH→USDT0 where the Tsunami pool has ~$1.50 TVL). Internally fetches a Relay quote, then sends every approval+deposit transaction returned in `quote.steps` from the configured EVM wallet. Returns all tx hashes plus the Relay request ID for status tracking. Supports Ink-origin swaps only (the wallet only signs Ink txs); for cross-chain bridges from other origins, use `relay_get_quote` and submit the origin tx with the wallet on that chain.

### Changed
- `solana_orca_swap` description now warns "PREFER `solana_jupiter_swap` for almost all use cases" and explains why direct Whirlpool routing is fragile.

### Notes
- Internal: introduced a real handler-invocation smoke test alongside the existing "tools registered" smoke test, after the v1.14.0 weth_wrap routing bug shipped because the build only verified that the tool appeared in the listing — never that calls actually reached the handler.

## [1.14.0] — 2026-04-07

### Added
- **`weth_wrap` and `weth_unwrap` tools** — convert between native ETH and WETH on Ink. Unblocks Tydro `supply` and NADO `deposit` flows for users who hold native ETH instead of WETH. `weth_unwrap` accepts `"max"` to unwrap the full balance.
- **`solana_token_balance` tool** — fetch SPL token balances for any Solana wallet. Sums across both Token Program and Token-2022 accounts. Defaults the owner to the configured Solana wallet.
- **Solana ERC-8004 identity tool suite** — `solana_identity_register`, `solana_identity_check_registered`, `solana_identity_get_agent`, `solana_identity_get_owner_agents`, `solana_identity_set_agent_uri`, and `solana_identity_total_registered`. Wraps the QuantuLabs [`8004-solana`](https://github.com/QuantuLabs/8004-solana-ts) SDK on mainnet-beta. Required before `solana_sentry_agent_launch` (the Ink-side `identity_*` tools register on Ink only — Solana has its own registry).
- **`TSUNAMI_SUBGRAPH_URL` env var** — override the Goldsky subgraph endpoint without needing a new release. Useful when Goldsky republishes the subgraph at a new project/version path.
- New dependency: `8004-solana@^0.8.3`.

### Changed
- **`solana_sentry_submit` now auto-signs unsigned transactions** using the configured Solana key (env var or OS keychain). Previously, callers had to deserialize → sign externally → re-serialize before submission, requiring custom helper scripts. The flow is now: `solana_sentry_agent_launch` → `solana_sentry_submit` (auto-signed). Pre-signed transactions are passed through unchanged.
- **NADO module now uses the shared `getAccount()` / `getWalletClient()` helpers** from `src/client.ts` instead of reading `EVM_PRIVATE_KEY` directly. NADO write tools (`nado_deposit`, `nado_withdraw`, `nado_place_order`, `nado_cancel_order`, `nado_cancel_all`) and read tools (`nado_get_account`, `nado_get_positions`, `nado_get_open_orders`, `nado_get_trade_history`) now work with keys stored in the OS keychain — closing the previous asymmetry where every other EVM module supported keychain but NADO did not.
- **`nado_get_account` (and the other NADO read tools)** now default `address` to the configured wallet when omitted, instead of throwing.
- **Tsunami subgraph URL bumped** from `tsunami-v3/1.0.0/gn` to `tsunami-v3/2.2.0/gn` (the previous URL was 404'ing on every `subgraph_*` tool because Goldsky republished the subgraph at a new version path).
- **`sentry_launch`, `sentry_launch_agent`, and `solana_sentry_agent_launch` tool descriptions clarified**: the single-sided LP NFT is held permanently inside the factory contract itself, not in a separate locker contract. There is no withdraw or remove-liquidity path — only fee collection via `sentry_collect_fees`. This corrects misleading wording that suggested LPs were locked in the Citadel locker.

### Fixed
- **`tsunami_swap_exact_input` / `tsunami_swap_exact_output` reverting with `STF` (SafeTransferFrom failed)** when selling non-WETH tokens immediately after a fresh approval. Root cause: `viem`'s `waitForTransactionReceipt` returns receipts for reverted transactions without throwing, so a silently-failed approve would let the broken swap proceed. The shared `ensureApproval` helper now (a) verifies `receipt.status === 'success'` after the approve and throws clearly on revert, and (b) re-reads the allowance with retry/backoff after confirmation to defend against eventually-consistent RPC providers serving stale state immediately after a confirmed write.

## [1.13.0] — 2026-04-07

### Added
- Solana private key (`SOL_PRIVATE_KEY`) can now be stored in the OS keychain via `moltiverse-mcp-setup`, mirroring the existing EVM key flow. The setup script prompts for EVM key first, then Solana key (blank to skip).
- Runtime now reads `SOL_PRIVATE_KEY` from `process.env` first, then falls back to OS keychain — matching the existing `EVM_PRIVATE_KEY` fallback order.

### Changed
- `moltiverse-mcp-setup delete` now removes both EVM and Solana keychain entries.

## [1.12.0] — 2026-04-07

### Added
- **`sentry_launch_agent`** — new tool for agent-only token launches. Calls the `launchAgent()` function on the unified SentryLaunchFactory, which requires the caller to hold an ERC-8004 identity NFT.

### Changed
- **Unified SentryLaunchFactory** — replaced the old `SentryAgentLaunchFactory` contract (0x733733...) with the new upgradeable proxy at `0xDc37e11B68052d1539fa23386eE58Ac444bf5BE1`. One contract now handles both permissionless launches (`launch`) and agent launches (`launchAgent`).
- **Fee routing updated** — WETH-side LP trading fees now route to stakeholder yield wallets (separate wallets for regular vs agent launches) instead of auto-swapping to MOLTING. Token-side fees still go to treasury.
- `sentry_launch` description updated to clarify it is permissionless and open to anyone.
- `sentry_collect_fees` description updated to reflect the new fee routing model.
- `identity_register` and `identity_check_registered` descriptions now reference `sentry_launch_agent()` instead of `sentry_launch()`.
- ABI renamed from `SentryAgentLaunchFactory` to `SentryLaunchFactory` with new contract functions and events.

### Docs
- **README.md** — updated Sentry section to 7 tools, added `sentry_launch_agent` row, updated contract address and architecture diagram, updated ERC-8004 section to reference `sentry_launch_agent`.
- **docs/sentry-launch-factory.md** — rewrote from scratch for the unified contract (replaced old `sentry-agent-launch-factory.md`). Documents both launch paths, new fee routing model, Citadel integration, updated events and view functions, and new contract addresses.
- **docs/skills/sentry-skills.md** — rewrote to cover both permissionless and agent-gated launch workflows.
- **docs/skills/identity-skills.md** — updated ERC-8004 identity flow to reference `sentry_launch_agent()` instead of `sentry_launch()`.

## [1.11.3] — 2026-03-24

### Fixed
- **`parseWhirlpoolData` byte offsets were wrong — root cause of all swap failures.** The Whirlpool bump field is 1 byte, not 2. This 1-byte misalignment corrupted every downstream field: tickSpacing read as 32768 instead of 128, tickCurrentIndex as -1.1 billion, and mints resolved to nonexistent addresses. All pool reads (pool_info, quote, swap) now use SentryBot's proven fixed offsets (tickSpacing @41, liquidity @49, sqrtPrice @65, tickCurrentIndex @81, mintA @101, vaultA @133, mintB @181, vaultB @213).

## [1.11.2] — 2026-03-24

### Fixed
- **`solana_orca_swap` `IncorrectProgramId` on Token-2022 mints** — The swap instruction was hardcoding `TOKEN_PROGRAM_ID` for both token accounts. Now dynamically resolves each mint's token program (Token Program vs Token-2022) and uses the correct program for ATA derivation, ATA creation, WSOL sync/close, and `swap_v2` account keys.

## [1.11.1] — 2026-03-24

### Fixed
- **`solana_orca_swap` failing on fresh pools** — Error 3012 (`TickArraySequenceInvalidIndex`) on newly launched tokens. Ported battle-tested swap logic from SentryBot:
  - Tick array stride calculation was overshooting by 3x; corrected to `TICK_ARRAY_SIZE * tickSpacing` per step.
  - Auto-initializes missing standard tick arrays in the same transaction (fresh pools only have dynamic tick arrays from LP provisioning).
  - Fixed `initialize_tick_array` Anchor discriminator and account ordering.
  - Added idempotent ATA creation for both token accounts.
  - Added WSOL wrapping (`SystemProgram.transfer` + `syncNative`) for SOL-input swaps.
  - Added WSOL unwrapping (`closeAccount`) for SOL-output swaps.
  - 3-attempt retry with tick index nudge (±1) on boundary errors.

## [1.11.0] — 2026-03-23

### Added
- **Solana Sentry Launch Factory** — 5 tools: `solana_sentry_agent_launch`, `solana_sentry_submit`, `solana_sentry_lookup`, `solana_sentry_list`, `solana_sentry_stats`. Agents can deploy tokens on Solana via the Sentry API with 8004 identity verification, query the on-chain factory registry, and list all factory-deployed tokens.
- **Solana Orca Whirlpool** — 3 tools: `solana_orca_pool_info`, `solana_orca_quote`, `solana_orca_swap`. Direct Orca CLMM pool interaction for reading pool state, estimating swap output, and executing swaps.
- `SOLANA_RPC_URL` and `SOL_PRIVATE_KEY` environment variables for Solana connectivity.
- Solana keychain support: `SOL_PRIVATE_KEY` accepts base58 or JSON byte array format.
- `@solana/web3.js`, `@solana/spl-token`, and `bs58` dependencies.

## [1.10.2] — 2026-03-19

### Added
- GitHub Actions CI pipeline (typecheck + build on PRs and pushes to main).
- CHANGELOG.md with retroactive history from v1.7.0.

### Fixed
- Version string mismatch: Server constructor and startup log now match `package.json`.
- Added `@types/node` to devDependencies for correct CI type-checking.
- TypeScript narrowing in `keychain.ts` for `process.env` assignment.

### Changed
- Branch protection enabled on `main` (force pushes blocked, PRs required).
- Secret scanning and push protection enabled on GitHub.
- Squash-only merges with auto-delete of merged branches.
- CHANGELOG.md now included in npm package.

## [1.10.1] — 2026-03-18

### Changed
- Updated README with ERC-8004 agent identity and DailyGM documentation sections.

## [1.10.0] — 2026-03-18

### Added
- **ERC-8004 Agent Identity** — 6 tools: `identity_register`, `identity_check_registered`, `identity_get_agent`, `identity_set_agent_uri`, `identity_get_owner_agents`, `identity_total_registered`.
- **DailyGM** — 3 tools: `dailygm_gm`, `dailygm_gm_to`, `dailygm_last_gm`.
- Agent identity docs and skills playbooks.

## [1.9.6] — 2026-03-18

### Fixed
- ZNS `priceToRegister` parameter type corrected from `uint256` to `uint16`.

## [1.9.5] — 2026-03-18

### Fixed
- ZNS bypasses SDK for Ink, calls the registry contract directly for reliability.

## [1.9.4] — 2026-03-18

### Fixed
- ZNS tools properly instantiate SDK and handle 404 on unregistered domains.

## [1.9.3] — 2026-03-17

### Fixed
- `nado_withdraw` uses slow-mode `submitSlowModeTransaction` for correctness.

## [1.9.2] — 2026-03-17

### Fixed
- `nado_withdraw` uses sequential nonce from archive API.

## [1.9.1] — 2026-03-17

### Fixed
- NADO order signing overhaul: robust account parsing, withdraw via gateway.

## [1.9.0] — 2026-03-17

### Added
- `nado_deposit` and `nado_withdraw` tools for NADO margin management.

### Fixed
- Tydro `parseAmount` handling.

## [1.8.5] — 2026-03-17

### Changed
- Bumped version to publish updated README to npm.

## [1.8.4] — 2026-03-17

### Added
- `RPC_URL` environment variable support for custom Ink RPC endpoints.
- OS keychain support for EVM private key storage (`keytar`).

### Fixed
- Keytar CJS/ESM interop for native module loading.

## [1.8.3] — 2026-03-17

### Changed
- Upgraded to SentryAgentLaunchFactoryV3: WETH fees auto-buy MOLTING.

## [1.8.0] — 2026-03-16

### Added
- **ZNS Connect** — 6 tools: `zns_resolve_domain`, `zns_resolve_address`, `zns_check_domain`, `zns_get_metadata`, `zns_get_price`, `zns_register`.
- ZNS documentation and agent skills playbook.
- `zns-sdk` dependency.

## [1.7.0] — 2026-03-16

### Added
- Initial release with 62 tools across 8 protocol modules.
- **Tsunami V3 DEX** — 13 tools: quotes, swaps, pool management, LP positions.
- **Sentry Agent Launch Factory** — 6 tools: token launch, creator NFTs, fee collection.
- **Tydro Lending** — 7 tools: supply, borrow, repay, withdraw, reserve/account data.
- **NADO Perps DEX** — 8 tools: markets, prices, orders, positions, candlesticks.
- **Citadel LP Locker** — 9 tools: lock/unlock LP, collect fees, stats.
- **ERC-20** — 4 tools: balance, allowance, approve, transfer.
- **Subgraph Analytics** — 6 tools: protocol stats, pools, swaps, positions, daily data.
- **Relay Protocol** — 6 tools: cross-chain bridge/swap, quotes, token prices.
- Protocol documentation for all modules.
- Agent skills playbooks for multi-step workflows.
- BYOA key management via OS keychain or environment variable.
- Molting API integration for optional remote signing.
