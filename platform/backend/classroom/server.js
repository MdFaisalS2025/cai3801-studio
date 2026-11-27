// Starts the classroom server: node classroom/server.js (or npm run classroom).
//
// Env (see classroom/README.md): PORT, CLASS_STORE, CLASS_DB, SITE_DIR, LLM_PROVIDER and its
// settings, SETUP_TOKEN, COOKIE_SECURE, PUBLIC_URL.

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createDocStore } from './store.js';
import { createClassroomApp } from './app.js';
import { createProvider } from '../llm/index.js';
import { newToken } from './security.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const env = process.env;
const store = await createDocStore(env);
// Default: no server AI. Everyone brings their own free Gemini key, used from their own browser.
// Set LLM_PROVIDER (e.g. vertex-gemini) only if the course pays for a shared model.
let llm = null;
if (env.LLM_PROVIDER && env.LLM_PROVIDER !== 'none') {
  try { llm = await createProvider(env.LLM_PROVIDER, env); } catch (e) { console.warn('AI is off:', e.message); }
}
const siteDir = path.resolve(env.SITE_DIR || path.join(here, '..', '..', '..', 'site'));

const users = await store.find('users');
const setupToken = env.SETUP_TOKEN || (users.length ? null : newToken(9));
const app = createClassroomApp({ store, llm, env, siteDir, setupToken });
const port = Number(env.PORT || 8080);
app.listen(port, env.HOST || '0.0.0.0', () => {
  console.log(`classroom server on :${port} (store=${store.kind}, ai=${llm ? llm.id : 'off'}, site=${siteDir})`);
  if (!users.length) console.log(`First run. Open /setup and use this setup code: ${setupToken}`);
});
