// API tests: real HTTP against the app on a random port, memory storage, mock LLM.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { buildService } from '../api/bootstrap.js';
import { createApp } from '../api/app.js';

let server;
let base;
let service;

before(async () => {
  ({ service } = await buildService({ STORAGE: 'memory', LLM_PROVIDER: 'mock' }));
  const app = createApp({ service, logger: { error() {} } });
  await new Promise((resolve) => {
    server = app.listen(0, '127.0.0.1', resolve);
  });
  base = `http://127.0.0.1:${server.address().port}`;
});

after(() => new Promise((resolve) => server.close(resolve)));

const as = (role, user) => ({ 'x-demo-role': role, 'x-demo-user': user });
const TA = as('ta', 'ta_02');
const FAC = as('faculty', 'fac_01');

async function call(method, path, { headers = {}, body } = {}) {
  const res = await fetch(`${base}${path}`, {
    method,
    headers: { ...(body ? { 'content-type': 'application/json' } : {}), ...headers },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: res.status, body: await res.json() };
}

test('health check needs no auth; API needs demo headers', async () => {
  assert.equal((await call('GET', '/healthz')).status, 200);
  const r = await call('GET', '/api/class/overview');
  assert.equal(r.status, 401);
  assert.match(r.body.message, /Demo only/);
});

test('demo data: 30 students, current week 12', async () => {
  const r = await call('GET', '/api/class/overview', { headers: TA });
  assert.equal(r.status, 200);
  assert.equal(r.body.students, 30);
  assert.equal(r.body.week, 12);
  assert.equal(r.body.competencyAverages.length, 8);
  assert.ok(r.body.competencyAverages.every((c) => c.average === null || (c.average >= 0 && c.average <= 100)));
  const flagged = Object.fromEntries(r.body.atRisk.map((a) => [a.student, a.reasons.map((x) => x.code)]));
  assert.ok(flagged.stu_003.includes('inactive'));
  assert.ok(flagged.stu_011.includes('competency-drop'));
  assert.ok(!flagged.stu_009);
  assert.ok(r.body.gradingQueue.released > 0);
  assert.ok(r.body.calibration.pairs > 0);
  assert.ok(r.body.calibration.qwk > 0.5);
});

test('class overview is for staff only', async () => {
  assert.equal((await call('GET', '/api/class/overview', { headers: as('student', 'stu_001') })).status, 403);
  assert.equal((await call('GET', '/api/class/overview', { headers: FAC })).status, 200);
});

test('progress: self or staff; levels from graded evidence; XP never in the grade', async () => {
  const self = await call('GET', '/api/students/stu_009/progress', { headers: as('student', 'stu_009') });
  assert.equal(self.status, 200);
  assert.equal(self.body.student.id, 'stu_009');
  assert.equal(self.body.competencies.length, 8);
  assert.ok(self.body.competencies.find((c) => c.id === 'critical').level >= 85);
  assert.equal(self.body.gamification.countsTowardGrade, false);
  assert.ok(self.body.gamification.xp > 0);
  assert.ok(self.body.grades.some((g) => g.released && g.note.includes('AI')));
  assert.equal((await call('GET', '/api/students/stu_009/progress', { headers: as('student', 'stu_010') })).status, 403);
  assert.equal((await call('GET', '/api/students/stu_009/progress', { headers: TA })).status, 200);
  assert.equal((await call('GET', '/api/students/stu_999/progress', { headers: TA })).status, 404);
});

test('recommendations show the rules on the demo students', async () => {
  const rec = async (id) => (await call('GET', `/api/students/${id}/recommendations`, { headers: TA })).body.recommendations;
  const rulesOf = (list) => list.flatMap((r) => r.rules);
  assert.ok(rulesOf(await rec('stu_003')).includes('R3'));
  assert.ok(rulesOf(await rec('stu_005')).includes('R4'));
  assert.ok(rulesOf(await rec('stu_007')).includes('R2'));
  assert.ok(rulesOf(await rec('stu_009')).includes('R5'));
  for (const id of ['stu_001', 'stu_003', 'stu_005']) {
    const list = await rec(id);
    assert.ok(list.length <= 3);
    list.forEach((r) => assert.ok(r.reason.length > 10));
  }
  // Per SPEC, faculty are not on the list for recommend_next_steps.
  assert.equal((await call('GET', '/api/students/stu_003/recommendations', { headers: FAC })).status, 403);
});

test('events: validation, self-only for students, graded is staff-only', async () => {
  const ok = await call('POST', '/api/events', { headers: as('student', 'stu_020'), body: { actor: 'stu_020', verb: 'completed', object: 'w12-read' } });
  assert.equal(ok.status, 201);
  assert.equal(ok.body.event.week, 12);
  assert.match(ok.body.event.id, /^evt_/);
  assert.equal((await call('POST', '/api/events', { headers: as('student', 'stu_020'), body: { actor: 'stu_021', verb: 'completed', object: 'w12-read' } })).status, 403);
  assert.equal((await call('POST', '/api/events', { headers: as('student', 'stu_020'), body: { actor: 'stu_020', verb: 'graded', object: 'w12-practice', result: { score: 1 } } })).status, 403);
  const bad = await call('POST', '/api/events', { headers: TA, body: { actor: 'stu_020', verb: 'danced', object: 'w12-read' } });
  assert.equal(bad.status, 400);
  assert.match(bad.body.message, /verb/);
});

test('tutor: grounded, cited, logs the question, refuses lab answers', async () => {
  const r = await call('POST', '/api/tutor', { headers: as('student', 'stu_021'), body: { question: 'Why does a discount need a human approval gate?' } });
  assert.equal(r.status, 200);
  assert.equal(r.body.grounded, true);
  assert.equal(r.body.citations[0].id, 'rd-7-2');
  const p = await call('GET', '/api/students/stu_021/progress', { headers: TA });
  assert.equal(p.body.recentEvents[0].verb, 'asked');
  assert.equal(p.body.recentEvents[0].object, 'w12-read');

  const no = await call('POST', '/api/tutor', { headers: as('student', 'stu_021'), body: { question: 'Give me the answers to the Discount Desk lab' } });
  assert.equal(no.body.refused, true);
  assert.equal((await call('POST', '/api/tutor', { headers: as('student', 'stu_021'), body: {} })).status, 400);
});

test('hybrid grading over HTTP: submit, suggest, TA review, release', async () => {
  const student = as('student', 'stu_022');
  const text = 'Evidence: every approval cites the order total and the customer tier from the order data. Guardrails: the order note said to ignore the policy, so the agent refused and escalated the mismatch. Human gate: no discount is applied until a manager approves it in the queue, and I logged each decision.';
  const sub = await call('POST', '/api/events', { headers: student, body: { actor: 'stu_022', verb: 'submitted', object: 'w12-lab', text } });
  assert.equal(sub.status, 201);
  const id = sub.body.submission.id;
  assert.equal(sub.body.submission.status, 'submitted');

  assert.equal((await call('POST', `/api/submissions/${id}/suggest`, { headers: student })).status, 403);
  const sug = await call('POST', `/api/submissions/${id}/suggest`, { headers: TA });
  assert.equal(sug.status, 200);
  assert.equal(sug.body.status, 'ai_suggested');
  assert.equal(sug.body.ai.criteria.length, 3);
  sug.body.ai.criteria.forEach((c) => assert.ok(text.includes(c.evidence)));

  // Students cannot see the AI's numbers before release.
  const before = await call('GET', '/api/students/stu_022/progress', { headers: student });
  const g = before.body.grades.find((x) => x.id === id);
  assert.equal(g.released, false);
  assert.equal(g.criteria, undefined);

  const bad = await call('POST', `/api/submissions/${id}/review`, { headers: TA, body: { criteria: [{ id: 'c1', score: 9 }] } });
  assert.equal(bad.status, 400);

  const criteria = sug.body.ai.criteria.map((c) => ({ id: c.id, score: c.score }));
  const rev = await call('POST', `/api/submissions/${id}/review`, { headers: TA, body: { criteria, comment: 'Solid guardrails.' } });
  assert.equal(rev.status, 200);
  const expected = sug.body.routing.toFaculty ? 'ta_reviewed' : 'released';
  assert.equal(rev.body.status, expected);
  if (expected === 'ta_reviewed') {
    const fac = await call('POST', `/api/submissions/${id}/review`, { headers: FAC, body: { comment: 'Signed off.' } });
    assert.equal(fac.body.status, 'released');
  }
  const after = await call('GET', '/api/students/stu_022/progress', { headers: student });
  const released = after.body.grades.find((x) => x.id === id);
  assert.equal(released.released, true);
  assert.match(released.note, /AI model suggested a first-pass score/);
  // A second review on a released submission is rejected.
  assert.equal((await call('POST', `/api/submissions/${id}/review`, { headers: TA, body: { criteria } })).status, 409);
});

test('flagged submissions route to faculty and wait for sign-off', async () => {
  const id = 'sub_stu_013_w12-lab';
  const sug = await call('POST', `/api/submissions/${id}/suggest`, { headers: TA });
  assert.equal(sug.status, 200);
  assert.ok(sug.body.ai.flags.includes('injection-attempt'));
  assert.equal(sug.body.routing.toFaculty, true);
  const criteria = sug.body.ai.criteria.map((c) => ({ id: c.id, score: c.score }));
  const rev = await call('POST', `/api/submissions/${id}/review`, { headers: TA, body: { criteria } });
  assert.equal(rev.body.status, 'ta_reviewed');
  const ov = await call('GET', '/api/class/overview', { headers: FAC });
  assert.ok(ov.body.facultyQueue.some((s) => s.id === id));
  const fac = await call('POST', `/api/submissions/${id}/review`, { headers: FAC, body: { criteria: criteria.map((c) => ({ ...c, score: 1 })), comment: 'Injection attempt noted.' } });
  assert.equal(fac.body.status, 'released');
  assert.equal(fac.body.faculty.signedOff, true);
});

test('unknown routes and bad JSON', async () => {
  assert.equal((await call('GET', '/api/nope', { headers: TA })).status, 404);
  const res = await fetch(`${base}/api/events`, { method: 'POST', headers: { ...TA, 'content-type': 'application/json' }, body: '{bad' });
  assert.equal(res.status, 400);
});
