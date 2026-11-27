// One LLM interface, swappable providers (SPEC: LLM providers).
//
//   const llm = await createProvider();            // uses LLM_PROVIDER, default "mock"
//   const { text, json } = await llm.complete({ system, messages, json: true });
//
// messages: [{ role: 'user' | 'assistant', content: string }]
// json: true asks the provider for a JSON object; the parsed value is returned as `json`.
// meta: optional structured hints. Real providers ignore it; the mock uses it to stay deterministic.
//
// Adapters are imported only when selected, so tests and local runs never need cloud SDKs
// or credentials.

const ADAPTERS = {
  mock: () => import('./adapters/mock.js'),
  'vertex-gemini': () => import('./adapters/vertexGemini.js'),
  'openai-compatible': () => import('./adapters/openaiCompatible.js'),
  'vertex-open': () => import('./adapters/vertexOpen.js'),
  'vertex-claude': () => import('./adapters/vertexClaude.js'),
};

export const PROVIDER_IDS = Object.freeze(Object.keys(ADAPTERS));

/**
 * @param {string} [name] provider id; defaults to env.LLM_PROVIDER or "mock"
 * @param {object} [env] environment (defaults to process.env)
 * @param {object} [deps] optional injected dependencies, e.g. { fetch } for tests
 */
export async function createProvider(name, env = process.env, deps = {}) {
  const id = name || env.LLM_PROVIDER || 'mock';
  const load = ADAPTERS[id];
  if (!load) throw new Error(`Unknown LLM provider "${id}". Use one of: ${PROVIDER_IDS.join(', ')}.`);
  const mod = await load();
  return mod.create(env, deps);
}

export { parseJson } from './parseJson.js';
