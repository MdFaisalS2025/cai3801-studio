// Shared client for OpenAI-compatible /chat/completions endpoints (vLLM, USF endpoints,
// Vertex Model Garden OpenAI-compatible endpoints).

import { parseJson } from '../parseJson.js';

export function openAiChatClient({ id, url, model, getHeaders, jsonMode = true, temperature = 0.2, maxTokens = 1024, fetchImpl }) {
  const doFetch = fetchImpl || globalThis.fetch;
  return {
    id,
    model,
    async complete({ system, messages = [], json = false } = {}) {
      const body = {
        model,
        messages: [
          ...(system ? [{ role: 'system', content: system }] : []),
          ...messages.map((m) => ({ role: m.role, content: m.content })),
        ],
        temperature,
        max_tokens: maxTokens,
        ...(json && jsonMode ? { response_format: { type: 'json_object' } } : {}),
      };
      const res = await doFetch(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json', ...(await getHeaders()) },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const detail = await res.text().catch(() => '');
        throw new Error(`${id} request failed: HTTP ${res.status} ${detail.slice(0, 300)}`);
      }
      const data = await res.json();
      const choice = data.choices && data.choices[0];
      const text = (choice && choice.message && choice.message.content) || '';
      return { text, json: json ? parseJson(text) : null, model: data.model || model, provider: id };
    },
  };
}
