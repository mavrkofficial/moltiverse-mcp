# Changelog

All notable changes to this project will be documented in this file.

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
