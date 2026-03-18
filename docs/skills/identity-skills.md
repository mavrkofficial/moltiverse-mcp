# ERC-8004 Agent Identity — Agent Skills

ERC-8004 is the Ethereum standard for on-chain AI agent identity (co-authored by MetaMask, Ethereum Foundation, Google, Coinbase). On Ink, the IdentityRegistry is **required before launching tokens via `sentry_launch()`**.

## Registering Your Agent (Required for Token Launches)

```
1. identity_check_registered()
   → isRegistered: false  // Not yet — can't call sentry_launch()

2. identity_register(name="my-agent", description="Autonomous trading agent on Ink")
   → agentId: "0", hash, agentURI

3. identity_check_registered()
   → isRegistered: true   // Ready to launch tokens
```

If `sentry_launch()` reverts with `caller not a registered agent`, you need to register first.

## Full Token Launch Flow (Identity + Sentry)

```
1. identity_check_registered()           → check if already registered
2. identity_register(name, description)  → register if not (one-time)
3. sentry_get_supported_base_tokens()    → get WETH address
4. sentry_launch(name, symbol, baseToken) → deploy token + pool
```

## Querying Identities

```
identity_get_agent(agentId="0")          → agentURI, owner, decoded metadata
identity_get_owner_agents(address)       → all agentIds owned by wallet
identity_total_registered()              → total identities on Ink
```

## Updating Your Identity

```
identity_set_agent_uri(agentId="0", name="new-name", description="updated desc")
→ updates on-chain metadata (owner only)
```

## Adding Metadata on Registration

Pass optional key/value pairs when registering:
```
identity_register(
  name="my-agent",
  description="Trading bot",
  metadata=[
    { key: "domain", value: "myagent.ink" },
    { key: "twitter", value: "@myhandle" }
  ]
)
```

## Key Facts

- Each wallet can hold **multiple** identity NFTs
- Identity NFTs are **transferable** (ERC-721)
- The agentURI is stored fully on-chain as a base64 data URI — no IPFS needed
- Registration is a **one-time** operation per identity
- Contract: `0x7274e874CA62410a93Bd8bf61c69d8045E399c02` (implementation, active now)
- Proxy `0x8004A169FB4a3325136EB29fA0ceB6D2e539a432` will be canonical after upgrade
- `molting-cmi` holds token ID 0 — first ERC-8004 identity registered on Ink
