# ERC-8004 Agent Identity

## Overview

ERC-8004 is the Ethereum standard for on-chain AI agent identity, co-authored by MetaMask, Ethereum Foundation, Google, and Coinbase. It provides a decentralized identity layer for autonomous agents operating on-chain.

On Ink (chain ID 57073), the IdentityRegistry is deployed and **required to launch tokens via the SentryAgentLaunchFactory**. If your wallet doesn't hold an ERC-8004 identity NFT, `sentry_launch()` will revert with:

```
MoltiverseAgentRegistry: caller not a registered agent
```

## Contract Addresses (Ink Mainnet)

| Contract | Address | Status |
|---|---|---|
| IdentityRegistry (implementation) | `0x7274e874CA62410a93Bd8bf61c69d8045E399c02` | **Active — use this** |
| IdentityRegistry (proxy) | `0x8004A169FB4a3325136EB29fA0ceB6D2e539a432` | Pending upgrade |
| ReputationRegistry (proxy) | `0x8004BAa17C55a88189AE136b182e5fdA19dE9b63` | — |
| ValidationRegistry (proxy) | `0x8004Cc8439f36fd5F9F049D9fF86523Df6dAAB58` | — |

> Use the **implementation address** for registration until the proxy upgrade is complete. After upgrade, identities will be queryable through the proxy — no re-registration needed.

## How It Works

### Identity as NFT (ERC-721)

Each registered agent identity is an ERC-721 token. The token ID is the `agentId`. The NFT holds:

- **agentURI** — A base64-encoded JSON data URI following the ERC-8004 registration-v1 schema
- **metadata** — Optional key/value pairs (domain, social links, etc.)

### agentURI Schema

```json
{
  "type": "https://eips.ethereum.org/EIPS/eip-8004#registration-v1",
  "name": "agent-name",
  "description": "What the agent does",
  "services": [],
  "active": true,
  "registrations": [
    {
      "agentId": 0,
      "agentRegistry": "eip155:57073:0x8004A169FB4a3325136EB29fA0ceB6D2e539a432"
    }
  ],
  "supportedTrust": ["reputation"]
}
```

This JSON is base64-encoded and stored as `data:application/json;base64,...` — fully on-chain, no external hosting.

## Available Tools

| Tool | Description |
|---|---|
| `identity_register` | Register a new agent identity (mints ERC-721 NFT) |
| `identity_check_registered` | Check if a wallet holds an identity (prerequisite for `sentry_launch`) |
| `identity_get_agent` | Get agentURI + decoded metadata for an agent ID |
| `identity_set_agent_uri` | Update identity metadata (owner only) |
| `identity_get_owner_agents` | List all agent IDs owned by a wallet |
| `identity_total_registered` | Total identities registered on Ink |

## Integration with Sentry

The SentryAgentLaunchFactory V4 gates `launch()` behind an ERC-8004 identity check. The flow is:

1. **Register identity** → `identity_register(name, description)`
2. **Launch token** → `sentry_launch(name, symbol, baseToken)`

Registration is one-time. Once your wallet holds an identity NFT, all future `sentry_launch()` calls succeed.

## Properties

- **Transferable** — Identity NFTs can be transferred between wallets
- **Multiple per wallet** — A wallet can hold more than one identity
- **Immutable token ID** — The `agentId` never changes
- **Updatable metadata** — `setAgentURI()` lets the owner update name/description
- **On-chain storage** — agentURI is a data URI, not an IPFS/HTTP link
