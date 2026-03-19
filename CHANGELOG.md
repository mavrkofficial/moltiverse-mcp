# Changelog

All notable changes to this project will be documented in this file.

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
