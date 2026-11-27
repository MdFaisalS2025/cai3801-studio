// Optional (SPEC lists it as optional): Claude on Vertex AI via the rawPredict endpoint.
// Not exercised by tests and not verified against a live project in this scaffold.
//
// Env: GOOGLE_CLOUD_PROJECT (required), VERTEX_CLAUDE_MODEL (required, a Claude model id
//      enabled in your Model Garden), VERTEX_CLAUDE_LOCATION (default us-east5),
//      LLM_MAX_TOKENS (default 1024)

import { parseJson } from '../parseJson.js';

export async function create(env = process.env, deps = {}) {
  const project = env.GOOGLE_CLOUD_PROJECT;
  const model = env.VERTEX_CLAUDE_MODEL;
  if (!project || !model) throw new Error('vertex-claude needs GOOGLE_CLOUD_PROJECT and VERTEX_CLAUDE_MODEL.');
  const location = env.VERTEX_CLAUDE_LOCATION || 'us-east5';
  const host = location === 'global' ? 'aiplatform.googleapis.com' : `${location}-aiplatform.googleapis.com`;
  const url = `https://${host}/v1/projects/${project}/locations/${location}/publishers/anthropic/models/${model}:rawPredict`;
  let getToken = deps.getAccessToken;
  if (!getToken) {
    const { GoogleAuth } = await import('google-auth-library');
    const auth = new GoogleAuth({ scopes: ['https://www.googleapis.com/auth/cloud-platform'] });
    getToken = async () => auth.getAccessToken();
  }
  const doFetch = deps.fetch || globalThis.fetch;
  return {
    id: 'vertex-claude',
    model,
    async complete({ system, messages = [], json = false } = {}) {
      const sys = system && json ? `${system}\nReply with one JSON object only.` : system;
      const res = await doFetch(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${await getToken()}` },
        body: JSON.stringify({
          anthropic_version: 'vertex-2023-10-16',
          max_tokens: Number(env.LLM_MAX_TOKENS || 1024),
          ...(sys ? { system: sys } : {}),
          messages: messages.map((m) => ({ role: m.role, content: m.content })),
        }),
      });
      if (!res.ok) throw new Error(`vertex-claude request failed: HTTP ${res.status}`);
      const data = await res.json();
      const text = (data.content || []).filter((b) => b.type === 'text').map((b) => b.text).join('');
      return { text, json: json ? parseJson(text) : null, model, provider: 'vertex-claude' };
    },
  };
}
