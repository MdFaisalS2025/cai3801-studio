// MCP smoke tests: an in-process client over InMemoryTransport, plus one Streamable HTTP call.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { buildService } from '../api/bootstrap.js';
import { createMcpServer } from '../mcp/server.js';
import { createMcpHttpApp } from '../mcp/http.js';

async function connect(identity) {
  const { service, llm } = await buildService({ STORAGE: 'memory', LLM_PROVIDER: 'mock' });
  const server = createMcpServer({ service, llm, identity });
  const [clientT, serverT] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: 'test-client', version: '0.0.1' });
  await Promise.all([server.connect(serverT), client.connect(clientT)]);
  return { client, close: async () => { await client.close(); await server.close(); } };
}

const json = (res) => JSON.parse(res.content[0].text);

test('MCP exposes the 7 SPEC tools', async () => {
  const { client, close } = await connect({ role: 'ta', user: 'ta_01' });
  const { tools } = await client.listTools();
  assert.deepEqual(tools.map((t) => t.name).sort(), [
    'class_overview', 'get_rubric', 'get_student_progress', 'list_lessons', 'recommend_next_steps', 'record_review', 'suggest_rubric_scores',
  ]);
  await close();
});

test('MCP: list_lessons and recommend_next_steps', async () => {
  const { client, close } = await connect({ role: 'ta', user: 'ta_01' });
  const lessons = json(await client.callTool({ name: 'list_lessons', arguments: { week: 12 } }));
  assert.equal(lessons.lessons.length, 1);
  assert.equal(lessons.lessons[0].title, 'Guardrails and the human gate');

  const rec = json(await client.callTool({ name: 'recommend_next_steps', arguments: { studentId: 'stu_005' } }));
  assert.ok(rec.recommendations.some((r) => r.rules.includes('R4')));
  rec.recommendations.forEach((r) => assert.ok(r.reason));
  await close();
});

test('MCP: zod validation and role checks', async () => {
  const { client, close } = await connect({ role: 'student', user: 'stu_005' });
  const self = await client.callTool({ name: 'get_student_progress', arguments: { studentId: 'stu_005' } });
  assert.ok(!self.isError);
  const other = await client.callTool({ name: 'get_student_progress', arguments: { studentId: 'stu_006' } });
  assert.equal(other.isError, true);
  const overview = await client.callTool({ name: 'class_overview', arguments: {} });
  assert.equal(overview.isError, true);
  assert.match(overview.content[0].text, /may not call class_overview/);
  const invalid = await client.callTool({ name: 'list_lessons', arguments: { week: 99 } });
  assert.equal(invalid.isError, true);
  await close();
});

test('MCP: suggest then record_review keeps the human in charge', async () => {
  const { client, close } = await connect({ role: 'ta', user: 'ta_02' });
  const sug = json(await client.callTool({ name: 'suggest_rubric_scores', arguments: { submissionId: 'sub_stu_017_w12-lab' } }));
  assert.equal(sug.status, 'ai_suggested');
  assert.match(sug.note, /Suggestion only/);
  const criteria = sug.ai.criteria.map((c) => ({ id: c.id, score: c.score }));
  const rev = json(await client.callTool({ name: 'record_review', arguments: { submissionId: 'sub_stu_017_w12-lab', criteria, comment: 'ok' } }));
  assert.ok(['released', 'ta_reviewed'].includes(rev.status));
  assert.equal(rev.ta.by, 'ta_02');
  const dry = json(await client.callTool({ name: 'suggest_rubric_scores', arguments: { rubricId: 'rubric-check', text: 'Evidence: the total is larger than the sum of the stores, so I checked the source. Concepts: a percentage share cannot exceed 100.' } }));
  assert.equal(dry.dryRun, true);
  assert.equal(dry.ai.criteria.length, 2);
  await close();
});

test('MCP over Streamable HTTP (stateless)', async () => {
  const { service, llm } = await buildService({ STORAGE: 'memory', LLM_PROVIDER: 'mock' });
  const app = createMcpHttpApp({ service, llm, host: '127.0.0.1', logger: { error() {} } });
  const server = await new Promise((resolve) => {
    const s = app.listen(0, '127.0.0.1', () => resolve(s));
  });
  const url = new URL(`http://127.0.0.1:${server.address().port}/mcp`);
  try {
    const unauth = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' });
    assert.equal(unauth.status, 401);

    const transport = new StreamableHTTPClientTransport(url, { requestInit: { headers: { 'x-demo-role': 'faculty', 'x-demo-user': 'fac_01' } } });
    const client = new Client({ name: 'http-test', version: '0.0.1' });
    await client.connect(transport);
    const rubric = json(await client.callTool({ name: 'get_rubric', arguments: { rubricId: 'rubric-desk' } }));
    assert.equal(rubric.criteria.length, 3);
    const overview = json(await client.callTool({ name: 'class_overview', arguments: {} }));
    assert.equal(overview.students, 30);
    await client.close();
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});
