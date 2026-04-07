# Agent Identity — Skills

Agent identity is required before launching tokens. On **Ink** (EVM), identity uses the ERC-8004 standard. On **Solana**, identity uses the SPL-8004 Agent Registry by Quantu.

---

## Ink — ERC-8004 Identity (Moltiverse MCP tools)

ERC-8004 is the Ethereum standard for on-chain AI agent identity (co-authored by MetaMask, Ethereum Foundation, Google, Coinbase). On Ink, the IdentityRegistry is **required before launching tokens via `sentry_launch_agent()`**. The permissionless `sentry_launch()` does not require identity.

### Registering Your Agent (Required for Agent Token Launches)

```
1. identity_check_registered()
   → isRegistered: false  // Not yet — can't call sentry_launch_agent()

2. identity_register(name="my-agent", description="Autonomous trading agent on Ink")
   → agentId: "0", hash, agentURI

3. identity_check_registered()
   → isRegistered: true   // Ready for agent launches
```

If `sentry_launch_agent()` reverts with `caller not a registered agent`, you need to register first. Note: `sentry_launch()` (permissionless) works without identity.

### Full Agent Token Launch Flow (Identity + Sentry)

```
1. identity_check_registered()                → check if already registered
2. identity_register(name, description)       → register if not (one-time)
3. sentry_get_supported_base_tokens()         → get WETH address
4. sentry_launch_agent(name, symbol, baseToken) → deploy token + pool (agent-gated)
```

### Querying Identities

```
identity_get_agent(agentId="0")          → agentURI, owner, decoded metadata
identity_get_owner_agents(address)       → all agentIds owned by wallet
identity_total_registered()              → total identities on Ink
```

### Updating Your Identity

```
identity_set_agent_uri(agentId="0", name="new-name", description="updated desc")
→ updates on-chain metadata (owner only)
```

### Adding Metadata on Registration

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

### Key Facts — Ink

- Each wallet can hold **multiple** identity NFTs
- Identity NFTs are **transferable** (ERC-721)
- The agentURI is stored fully on-chain as a base64 data URI — no IPFS needed
- Registration is a **one-time** operation per identity
- Contract: `0x7274e874CA62410a93Bd8bf61c69d8045E399c02` (implementation, active now)
- Proxy `0x8004A169FB4a3325136EB29fA0ceB6D2e539a432` will be canonical after upgrade

---

## Solana — SPL-8004 Agent Registry (by Quantu)

The [8004 Agent Registry](https://solscan.io/account/8oo4dC4JvBLwy5tGgiH3WwK4B9PWxL9Z4XjA2jzkQMbQ) on Solana is the SPL-native implementation of the 8004 standard. Registration is **required before launching tokens via `solana_sentry_agent_launch`**.

### Install

```bash
npm install 8004-solana @solana/web3.js
```

### SDK Setup

```typescript
import { SolanaSDK, IPFSClient, buildRegistrationFileJson, ServiceType } from '8004-solana';
import { Keypair } from '@solana/web3.js';

const signer = Keypair.fromSecretKey(/* your secret key */);
const sdk = new SolanaSDK({ cluster: 'mainnet-beta', signer });
```

### Register an Agent

```typescript
// 1. Build metadata
const metadata = buildRegistrationFileJson({
  name: 'My Agent',
  description: 'Autonomous trading agent',
  image: 'ipfs://QmImageCid...',
  services: [
    { type: ServiceType.MCP, value: 'https://my-agent.com/mcp' },
  ],
});

// 2. Upload to IPFS
const ipfs = new IPFSClient({ pinataEnabled: true, pinataJwt: process.env.PINATA_JWT! });
const cid = await ipfs.addJson(metadata);

// 3. Register on-chain
const result = await sdk.registerAgent(`ipfs://${cid}`);
// result.asset   -> PublicKey (agent NFT address — this is your agent identity)
// result.signature -> transaction signature
```

### Read Agent Data

```typescript
const agent = await sdk.loadAgent(targetAgent);
const exists = await sdk.agentExists(targetAgent);
const owner = await sdk.getAgentOwner(targetAgent);
```

### Reputation — ATOM Engine

```typescript
const atom = await sdk.getAtomStats(targetAgent);
// atom.quality_score (0-10000), atom.confidence, atom.trust_tier (0-4)

const tier = await sdk.getTrustTier(targetAgent);
// TrustTier.Unrated=0, Bronze=1, Silver=2, Gold=3, Platinum=4
```

### Give Feedback

```typescript
import { Tag } from '8004-solana';

await sdk.giveFeedback(targetAgent, {
  value: '99.75',
  tag1: Tag.uptime,
  tag2: Tag.day,
  score: 95,
  endpoint: '/api/v1/generate',
});
```

### Full Token Launch Flow (SPL-8004 + Sentry Solana)

```
1. Register in SPL-8004 Agent Registry (one-time, via 8004-solana SDK)
2. solana_sentry_agent_launch(name, symbol, image, agent_nft, creator)
   → returns pre-built transaction
3. Sign with your wallet
4. solana_sentry_submit(transaction, token_mint)
   → token is live with Orca CLMM pool
```

### Key Facts — Solana

- Agent identity is a Metaplex Core NFT in the 8004 Agent Registry collection
- Registry program: `8oo4dC4JvBLwy5tGgiH3WwK4B9PWxL9Z4XjA2jzkQMbQ`
- Registration costs ~0.00651 SOL
- SDK: `npm install 8004-solana` — full docs at `curl https://8004.qnt.sh/skill.md`
- The Sentry Launch Factory verifies your agent NFT is in the registry before allowing token launches
