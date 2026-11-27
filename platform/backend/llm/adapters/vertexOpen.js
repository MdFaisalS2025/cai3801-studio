// Open models (Gemma, Llama, ...) deployed from Vertex Model Garden to a Vertex endpoint, called
// through the endpoint's OpenAI-compatible chat completions URL. Data stays in the project.
// Auth: a Google access token from Application Default Credentials.
//
// Env: VERTEX_OPEN_URL (required, the full .../chat/completions URL of the endpoint),
//      VERTEX_OPEN_MODEL (model name the endpoint expects; default "default"),
//      VERTEX_OPEN_JSON_MODE (default "on"), LLM_TEMPERATURE (default 0.2)

import { openAiChatClient } from './openaiChat.js';

export async function create(env = process.env, deps = {}) {
  const url = env.VERTEX_OPEN_URL;
  if (!url) throw new Error('vertex-open needs VERTEX_OPEN_URL (the endpoint chat/completions URL).');
  let getToken = deps.getAccessToken;
  if (!getToken) {
    const { GoogleAuth } = await import('google-auth-library');
    const auth = new GoogleAuth({ scopes: ['https://www.googleapis.com/auth/cloud-platform'] });
    getToken = async () => auth.getAccessToken();
  }
  return openAiChatClient({
    id: 'vertex-open',
    url,
    model: env.VERTEX_OPEN_MODEL || 'default',
    jsonMode: (env.VERTEX_OPEN_JSON_MODE || 'on') !== 'off',
    temperature: Number(env.LLM_TEMPERATURE ?? 0.2),
    getHeaders: async () => ({ authorization: `Bearer ${await getToken()}` }),
    fetchImpl: deps.fetch,
  });
}
