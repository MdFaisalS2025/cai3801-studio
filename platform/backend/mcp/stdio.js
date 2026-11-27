// MCP over stdio, for Claude Desktop and local agents.
// Identity (DEMO ONLY): MCP_ROLE (default ta) and MCP_USER (default ta_01).
// stdout carries the protocol, so log to stderr only.

import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { buildService } from '../api/bootstrap.js';
import { createMcpServer } from './server.js';

const { service, llm, store } = await buildService();
const identity = { role: process.env.MCP_ROLE || 'ta', user: process.env.MCP_USER || 'ta_01' };
const server = createMcpServer({ service, llm, identity });
await server.connect(new StdioServerTransport());
console.error(`cai3801 MCP on stdio (role=${identity.role}, storage=${store.kind}, llm=${llm.id})`);
