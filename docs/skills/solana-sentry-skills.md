# Sentry Agent Token Launch — Solana

**Purpose**: Launch a token on Solana through the Sentry Launch Factory as a verified 8004 agent.

## Overview

You do NOT build the Solana transaction yourself. The Sentry API handles everything — metadata hosting, PDA derivation, ALT creation, Orca pool setup. You send your token info and image, receive a pre-built transaction, sign it, and submit it back.

## Prerequisites

- You must be a registered 8004 agent (Metaplex Core NFT in the Sentry identity collection)
- Your **agent NFT address** (your 8004 identity on Solana)
- Your **Solana wallet keypair** (the wallet that owns the agent NFT)
- ~0.05 SOL in your wallet for the launch fee

## Step 1 — Call the API

One POST request. The API uploads your image and metadata to Supabase, derives all on-chain accounts, creates the ALT, and builds the transaction.

You can use the MCP tool `solana_sentry_agent_launch` or call the API directly:

```
POST https://web-production-7d3e.up.railway.app/api/agent-launch
Content-Type: application/json

{
  "name": "Your Token Name",
  "symbol": "TKN",
  "image": "https://your-image-url.png",
  "agent_nft": "<your-8004-agent-nft-address>",
  "creator": "<your-solana-wallet-public-key>",
  "description": "Optional description",
  "website": "https://optional.com",
  "twitter": "https://x.com/optional",
  "telegram": "https://t.me/optional"
}
```

**Required fields**: `name`, `symbol`, `image`, `agent_nft`, `creator`

**`image`** accepts:
- A URL (`https://...`) — the API downloads it
- A base64 data URI (`data:image/png;base64,...`)

**Optional fields**: `description`, `website`, `twitter`, `telegram`

If you already have a hosted metadata JSON, pass `uri` instead of `image` and the API will skip the upload.

**Constraints**: name max 32 chars, symbol max 10 chars.

**Response (200)**:
```json
{
  "transaction": "<base64-versioned-transaction>",
  "token_mint": "...",
  "whirlpool": "...",
  "position_mint": "...",
  "metadata_uri": "https://supabase.../token-logos/....json"
}
```

**Error responses**:
- `400` — missing or invalid fields
- `403` — agent verification failed (NFT not found, not owned by creator, wrong collection)
- `500` — server error

## Step 2 — Sign and Submit

Deserialize the transaction, add your wallet signature, and send it back along with the `token_mint` from Step 1.

You can use the MCP tool `solana_sentry_submit` or call the API directly:

```
POST https://web-production-7d3e.up.railway.app/api/agent-launch/submit
Content-Type: application/json

{
  "transaction": "<base64-of-fully-signed-transaction>",
  "token_mint": "<token_mint from step 1 response>"
}
```

**Response (200)**:
```json
{
  "signature": "...",
  "token_mint": "...",
  "explorer": "https://solscan.io/tx/..."
}
```

## Full Example (JavaScript)

```javascript
import { Keypair, VersionedTransaction } from "@solana/web3.js";

const API = "https://web-production-7d3e.up.railway.app";
const wallet = Keypair.fromSecretKey(/* your secret key */);
const AGENT_NFT = "<your-8004-agent-nft-address>";

// 1. Build transaction (API handles metadata + all Solana plumbing)
const buildRes = await fetch(`${API}/api/agent-launch`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    name: "My Token",
    symbol: "MTK",
    image: "https://example.com/logo.png",
    description: "A token launched by an autonomous agent",
    agent_nft: AGENT_NFT,
    creator: wallet.publicKey.toBase58(),
  }),
});
const { transaction, token_mint, whirlpool, metadata_uri } = await buildRes.json();

// 2. Sign with your wallet
const vtx = VersionedTransaction.deserialize(Buffer.from(transaction, "base64"));
vtx.sign([wallet]);

// 3. Submit (include token_mint so the server records it)
const submitRes = await fetch(`${API}/api/agent-launch/submit`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    transaction: Buffer.from(vtx.serialize()).toString("base64"),
    token_mint,
  }),
});
const { signature, explorer } = await submitRes.json();
console.log("Launched!", token_mint, explorer);
```

## What the API Handles

- Downloads your image and uploads it + metadata JSON to Supabase
- Verifies your 8004 identity on-chain
- Generates the token mint keypair
- Derives all 33 accounts (factory, Orca whirlpool, tick arrays, badges, position, metadata)
- Creates and funds an Address Lookup Table
- Builds a V0 versioned transaction pre-signed with ephemeral keypairs
- Records the token in the Sentry token registry after successful submission

## What You Handle

- Providing an image URL and token details
- Signing the transaction with your wallet
- Having ~0.05 SOL for the launch fee

Two HTTP calls. No PDAs, no ALTs, no Orca internals. Just send your token info, sign, submit.

## Post-Launch: Report to User

After a successful launch, always report:
- Token name and symbol
- Token mint address
- Pool pair address (whirlpool)
- Jupiter swap link: `https://jup.ag/swap/SOL-{token_mint}`
- Solscan link: `https://solscan.io/token/{token_mint}`
- Transaction signature and explorer link

## Other MCP Tools

### Look Up a Token

Use `solana_sentry_lookup` with a `mint` address to check if it was deployed through the factory. Returns creator, pool, timestamps, name, symbol, and whether it was an agent launch.

### List All Factory Tokens

Use `solana_sentry_list` to get every token deployed through the factory. Filter by `creator` or set `agent_only: true`.

### Factory Stats

Use `solana_sentry_stats` for total launches, admin, treasury, and buyback config.
