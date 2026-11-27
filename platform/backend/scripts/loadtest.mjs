// Simulates a class against a LOCAL classroom server and reports timings.
//   node scripts/loadtest.mjs http://localhost:8793 <setupToken> [students=600]
// It needs a fresh server (no accounts yet): it runs setup, then N students join and each one
// signs in, saves progress, logs events and prompts and submits once, 40 at a time.
// Then a TA view of the whole class is timed. Never point this at the real course.

const [base0, setupToken, n0] = process.argv.slice(2);
if (!base0 || !setupToken) { console.error('usage: node scripts/loadtest.mjs <url> <setupToken> [students]'); process.exit(2); }
if (!/^http:\/\/(localhost|127\.0\.0\.1)/.test(base0)) { console.error('Refusing: load tests run against a local server only.'); process.exit(2); }
const base = base0.replace(/\/+$/, ''), N = Number(n0 || 600), CONC = 40;

function client() {
  let cookie = '';
  return async (method, p, body) => {
    const r = await fetch(base + p, { method, headers: { 'content-type': 'application/json', 'x-cai-csrf': '1', ...(cookie ? { cookie } : {}) }, body: body ? JSON.stringify(body) : undefined });
    const m = /cai_s=([^;]+)/.exec(r.headers.get('set-cookie') || ''); if (m) cookie = 'cai_s=' + m[1];
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(`${method} ${p} -> ${r.status} ${j.message || ''}`);
    return j;
  };
}
const times = {};
async function timed(name, fn) { const t = performance.now(); try { return await fn(); } finally { (times[name] = times[name] || []).push(performance.now() - t); } }
const pct = (a, q) => { const s = [...a].sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(q * s.length))]; };

const fac = client();
const setup = await fac('POST', '/api/c/setup', { setupToken, name: 'Load Faculty', email: 'load.faculty@example.test', password: 'load-test-faculty-1', termStart: '2026-08-24' });
await fac('POST', '/api/c/class/settings', { sections: '001,002,003,004,005,006' });
const code = setup.class.joinCode;
console.log(`class ${code}; ${N} students, ${CONC} at a time`);

let errors = 0, done = 0;
const t0 = performance.now();
async function student(i) {
  const c = client();
  try {
    await timed('join', () => c('POST', '/api/c/join', { code, name: `Load Student ${i}`, email: `load.student${i}@example.test`, password: `load-test-pass-${i}-x`, consent: true, section: '00' + (1 + (i % 6)) }));
    for (let k = 0; k < 3; k++) await timed('save progress', () => c('PUT', '/api/c/me/state/studio', { data: { done: { [`w${k + 1}-read`]: true }, quiz: {}, plog: Array.from({ length: 20 }, (_, j) => ({ text: 'prompt ' + j })) } }));
    await timed('events', () => c('POST', '/api/c/me/events', { events: [{ verb: 'completed', object: 'w12-read', week: 12 }, { verb: 'completed', object: 'w12-practice', week: 12, score: 1 }, { verb: 'asked', object: 'tutor', week: 12 }] }));
    await timed('prompts', () => c('POST', '/api/c/me/prompts', { prompts: [{ tool: 'promptlab', text: 'Write a 2-sentence caption for a VP using only these numbers.', score: 60, week: 12 }] }));
    await timed('submit', () => c('POST', '/api/c/me/submissions', { key: 'w12-build', text: 'The model classifies; the policy decides; unclear cases go to a person. Student ' + i, aiuse: 'None' }));
  } catch (e) { errors += 1; if (errors <= 5) console.log('  error:', e.message); }
  done += 1; if (done % 100 === 0) console.log(`  ${done} students done`);
}
let next = 0;
await Promise.all(Array.from({ length: CONC }, async () => { while (next < N) await student(next++); }));
const total = (performance.now() - t0) / 1000;

const snap = await timed('staff class view (first)', () => fac('GET', '/api/c/class/snapshot'));
await timed('staff class view (cached)', () => fac('GET', '/api/c/class/snapshot'));
const page = await timed('faculty Studio page', async () => { const r = await fetch(base + '/', { headers: { cookie: '' } }); return r.status; });

console.log(`\n${N} students in ${total.toFixed(1)} s, ${errors} errors. Staff view: ${snap.students.length} students, ${snap.subs.length} submissions.`);
console.log('step'.padEnd(28) + 'count   median ms   p95 ms');
for (const [k, a] of Object.entries(times)) console.log(k.padEnd(28) + String(a.length).padEnd(8) + String(Math.round(pct(a, 0.5))).padEnd(12) + Math.round(pct(a, 0.95)));
void page;
process.exit(errors ? 1 : 0);
