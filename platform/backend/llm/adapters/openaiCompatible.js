// Any OpenAI-compatible endpoint: vLLM on GKE, a USF-provided endpoint, or a local server.
//
// Env: OPENAI_BASE_URL (required, e.g. http://localhost:8000/v1), OPENAI_MODEL (required),
//      OPENAI_API_KEY (optional; inject from Secret Manager in production, never commit it),
//      OPENAI_JSON_MODE (default "on"; set "off" if the server rejects response_format),
//      LLM_TEMPERATURE (default 0.2)

import { openAiChatClient } from './openaiChat.js';

export function create(env = process.env, deps = {}) {
  const base = env.OPENAI_BASE_URL;
  const model = env.OPENAI_MODEL;
  if (!base) throw new Error('openai-compatible needs OPENAI_BASE_URL.');
  if (!model) throw new Error('openai-compatible needs OPENAI_MODEL.');
  const key = env.OPENAI_API_KEY;
  return openAiChatClient({
    id: 'openai-compatible',
    url: `${base.replace(/\/+$/, '')}/chat/completions`,
    model,
    jsonMode: (env.OPENAI_JSON_MODE || 'on') !== 'off',
    temperature: Number(env.LLM_TEMPERATURE ?? 0.2),
    getHeaders: async () => (key ? { authorization: `Bearer ${key}` } : {}),
    fetchImpl: deps.fetch,
  });
}
