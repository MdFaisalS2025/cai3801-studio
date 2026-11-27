// Build the service from environment variables. Shared by the API server and the MCP server.
//
// STORAGE        memory (default) | firestore
// LLM_PROVIDER   mock (default) | vertex-gemini | vertex-open | openai-compatible | vertex-claude
// EVENT_SINK     none (default) | bigquery
// TERM_START     first Monday of term, ISO date (default 2026-08-31)
// DEMO_NOW       fixed "now" (ISO). Defaults to the seed date when STORAGE=memory so the demo
//                data looks current; unset with STORAGE=firestore to use the real clock.

import { createStore } from './storage/index.js';
import { createSink } from './sink.js';
import { createService } from './service.js';
import { createProvider } from '../llm/index.js';
import { DEMO_NOW, DEMO_TERM_START } from './storage/seed.js';

export async function buildService(env = process.env, overrides = {}) {
  const termStart = env.TERM_START || DEMO_TERM_START;
  const fixedNow = env.DEMO_NOW || ((env.STORAGE || 'memory') === 'memory' ? DEMO_NOW : null);
  const clock = overrides.clock || (fixedNow ? () => new Date(fixedNow) : () => new Date());
  const store = overrides.store || (await createStore(env, { termStart, now: fixedNow || undefined }));
  const llm = overrides.llm || (await createProvider(env.LLM_PROVIDER, env));
  const sink = overrides.sink || (await createSink(env));
  return { service: createService({ store, llm, sink, clock, termStart }), store, llm, sink };
}
