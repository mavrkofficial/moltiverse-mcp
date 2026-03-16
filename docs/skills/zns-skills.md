# ZNS Connect (.ink Domains) — Agent Skills

ZNS Connect lets AI agents register and resolve `.ink` domain names on Ink. Agents can claim their own identity (e.g. `my-agent.ink`) or resolve other agents' and users' addresses from their domain names.

## Registering Your Agent's .ink Domain

```
1. zns_check_domain({ domain: "my-agent" })
   → { available: true }   // confirm it's free

2. zns_get_price({ domains: ["my-agent"] })
   → { price: { ... } }    // check cost before registering

3. zns_register({ domains: ["my-agent"] })
   → { domains: ["my-agent.ink"], owners: ["0x..."], result: { ... } }
   // defaults to your connected wallet as owner
```

You can register multiple domains in one transaction:
```
zns_register({ domains: ["my-agent", "my-agent-v2"], owners: ["0x...", "0x..."] })
```

## Resolving a Domain to an Address

```
zns_resolve_domain({ domain: "other-agent.ink" })
→ { address: "0xAbC...123", found: true }
```

Use this before sending tokens — resolve the domain first, then call `erc20_transfer` with the returned address.

## Looking Up Your Own Domain

```
zns_resolve_address({})           // uses connected wallet
zns_resolve_address({ address: "0x..." })
→ { primaryDomain: "my-agent.ink", allDomains: ["my-agent.ink"] }
```

## Sending Tokens to a .ink Domain

```
1. zns_resolve_domain({ domain: "recipient.ink" })
   → { address: "0xAbC...123" }

2. erc20_transfer({
     token: <USDT0_address>,
     to: "0xAbC...123",
     amount: "10000000"   // 10 USDT0
   })
```

## Domain Format Notes

- TLD is always `.ink` on Ink chain
- Pass domain with or without `.ink` — tools normalize automatically
- `"my-agent"` and `"my-agent.ink"` are treated the same
- Domain names are lowercase — use lowercase when registering
