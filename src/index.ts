#!/usr/bin/env node

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';

import { serializeBigInts } from './client.js';
import { erc20Tools, handleErc20Tool } from './tools/erc20.js';
import { subgraphTools, handleSubgraphTool } from './tools/subgraph.js';
import { citadelTools, handleCitadelTool } from './tools/citadel.js';
import { sentryTools, handleSentryTool } from './tools/sentry.js';
import { tsunamiTools, handleTsunamiTool } from './tools/tsunami.js';
import { relayTools, handleRelayTool } from './tools/relay.js';
import { tydroTools, handleTydroTool } from './tools/tydro.js';
import { nadoTools, handleNadoTool } from './tools/nado.js';
import { znsTools, handleZnsTool } from './tools/zns.js';
import { identityTools, handleIdentityTool } from './tools/identity.js';
import { dailyGmTools, handleDailyGmTool } from './tools/dailygm.js';

// ── All Tools ──────────────────────────────────────────────────────────
const allTools = [
  ...erc20Tools,
  ...subgraphTools,
  ...citadelTools,
  ...sentryTools,
  ...tsunamiTools,
  ...relayTools,
  ...tydroTools,
  ...nadoTools,
  ...znsTools,
  ...identityTools,
  ...dailyGmTools,
];

// ── Route tool calls ───────────────────────────────────────────────────
async function handleToolCall(name: string, args: Record<string, unknown>): Promise<unknown> {
  if (name.startsWith('erc20_'))    return handleErc20Tool(name, args);
  if (name.startsWith('subgraph_')) return handleSubgraphTool(name, args);
  if (name.startsWith('citadel_'))  return handleCitadelTool(name, args);
  if (name.startsWith('sentry_'))   return handleSentryTool(name, args);
  if (name.startsWith('tsunami_'))  return handleTsunamiTool(name, args);
  if (name.startsWith('relay_'))    return handleRelayTool(name, args);
  if (name.startsWith('tydro_'))    return handleTydroTool(name, args);
  if (name.startsWith('nado_'))     return handleNadoTool(name, args);
  if (name.startsWith('zns_'))      return handleZnsTool(name, args);
  if (name.startsWith('identity_')) return handleIdentityTool(name, args);
  if (name.startsWith('dailygm_'))  return handleDailyGmTool(name, args);
  throw new Error(`Unknown tool: ${name}`);
}

// ── Server Setup ───────────────────────────────────────────────────────
const server = new Server(
  { name: 'moltiverse-mcp', version: '1.10.2' },
  { capabilities: { tools: {} } },
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: allTools,
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;
  try {
    const result = await handleToolCall(name, (args ?? {}) as Record<string, unknown>);
    return {
      content: [{ type: 'text', text: JSON.stringify(serializeBigInts(result), null, 2) }],
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      content: [{ type: 'text', text: JSON.stringify({ error: message }) }],
      isError: true,
    };
  }
});

// ── Start ──────────────────────────────────────────────────────────────
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error(`moltiverse-mcp v1.10.2 — ${allTools.length} tools registered`);
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
