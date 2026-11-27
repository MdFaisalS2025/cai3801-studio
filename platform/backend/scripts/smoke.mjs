// Quick check of a running classroom server, local or deployed:
//   node scripts/smoke.mjs https://your-service-url
// Read-only: it never creates accounts or changes data.

const base = (process.argv[2] || 'http://localhost:8080').replace(/\/+$/, '');
let failed = 0;
async function check(name, fn) {
  try { await fn(); console.log(`ok    ${name}`); }
  catch (e) { failed += 1; console.log(`FAIL  ${name}: ${e.message}`); }
}
const must = (c, m) => { if (!c) throw new Error(m); };

await check('health', async () => { const r = await fetch(base + '/healthz'); must(r.ok, `status ${r.status}`); const j = await r.json(); must(j.ok, 'not ok'); console.log(`      store=${j.store} ai=${j.llm}`); });
await check('signed-out visitors go to /login', async () => { const r = await fetch(base + '/', { redirect: 'manual' }); must(r.status === 302 && r.headers.get('location') === '/login', `got ${r.status} ${r.headers.get('location')}`); });
await check('sign-in page loads', async () => { const r = await fetch(base + '/login'); must(r.ok, `status ${r.status}`); must((await r.text()).includes('CAI 3801'), 'unexpected page'); });
await check('lab, companion and blueprint are served', async () => { for (const p of ['/lab.html', '/companion.html', '/blueprint.html']) { const r = await fetch(base + p); must(r.ok, `${p} ${r.status}`); } });
await check('security headers', async () => {
  const r = await fetch(base + '/login'); const h = (k) => r.headers.get(k) || '';
  must(h('x-content-type-options') === 'nosniff', 'nosniff missing');
  must(h('x-robots-tag').includes('noindex'), 'noindex missing');
  must(h('content-security-policy').includes("frame-ancestors 'self'"), 'frame-ancestors missing');
  if (base.startsWith('https://')) must(h('strict-transport-security'), 'HSTS missing on HTTPS');
});
await check('API refuses requests without the CSRF header', async () => { const r = await fetch(base + '/api/c/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' }); must(r.status === 403, `status ${r.status}`); });
await check('API needs a session', async () => { const r = await fetch(base + '/api/c/session'); must(r.status === 401, `status ${r.status}`); });
await check('setup state', async () => { const r = await fetch(base + '/api/c/setup'); const j = await r.json(); console.log(`      ${j.needsSetup ? 'needs setup: open /setup' : 'course is set up'}`); });

console.log(failed ? `\n${failed} check(s) failed` : '\nAll checks passed');
process.exit(failed ? 1 : 0);
