// MCP over Streamable HTTP (stateless), for Cloud Run. POST /mcp.
// A new MCP server + transport is created per request, sharing one service and store.
// Identity (DEMO ONLY) comes from the x-demo-role / x-demo-user headers.

import { pathToFileURL } from 'node:url';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { createMcpExpressApp } from '@modelcontextprotocol/sdk/server/express.js';
import { readDemoIdentity } from '../api/auth.js';
import { createMcpServer } from './server.js';

const rpcError = (res, status, message) =>
  res.status(status).json({ jsonrpc: '2.0', error: { code: -32000, message }, id: null });

export function createMcpHttpApp({ service, llm, host = '127.0.0.1', logger = console }) {
  const app = createMcpExpressApp({ host });
  app.get('/healthz', (req, res) => res.json({ ok: true }));

  app.post('/mcp', async (req, res) => {
    const identity = readDemoIdentity(req.headers);
    if (!identity) return rpcError(res, 401, 'Send x-demo-role and x-demo-user headers (demo only).');
    const server = createMcpServer({ service, llm, identity });
    try {
      const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
      res.on('close', () => {
        transport.close();
        server.close();
      });
      await server.connect(transport);
      await transport.handleRequest(req, res, req.body);
    } catch (err) {
      logger.error(err);
      if (!res.headersSent) rpcError(res, 500, 'Internal server error');
    }
    return undefined;
  });

  // Stateless mode: no server-initiated streams or sessions.
  app.get('/mcp', (req, res) => rpcError(res, 405, 'Method not allowed.'));
  app.delete('/mcp', (req, res) => rpcError(res, 405, 'Method not allowed.'));
  return app;
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  const { buildService } = await import('../api/bootstrap.js');
  const { service, llm, store } = await buildService();
  // Cloud Run needs 0.0.0.0. Set HOST=127.0.0.1 locally to get DNS rebinding protection.
  const host = process.env.HOST || '0.0.0.0';
  const port = Number(process.env.PORT || 8081);
  createMcpHttpApp({ service, llm, host }).listen(port, host, () => {
    console.log(`cai3801 MCP (Streamable HTTP) on http://${host}:${port}/mcp (storage=${store.kind}, llm=${llm.id})`);
  });
}
