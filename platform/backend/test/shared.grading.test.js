import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  createSubmission, applySuggestion, applyTaReview, applyFacultySignOff, routeToFaculty,
  studentView, quadraticWeightedKappa, calibration, GradingError, AI_NOTE,
} from '../shared/grading.js';
import { getRubric } from '../shared/lessons.js';

const rubric = getRubric('rubric-desk');
const ai = (scores, confs = [0.9, 0.9, 0.9], flags = []) => ({
  model: 'mock-1',
  flags,
  criteria: scores.map((s, i) => ({ id: `c${i + 1}`, score: s, max: 5, evidence: 'quote', confidence: confs[i] })),
});
const crit = (scores) => scores.map((s, i) => ({ id: `c${i + 1}`, score: s }));
const fresh = (extra = {}) => createSubmission({ id: 'sub_1', student: 'stu_1', activity: 'w12-lab', submittedAt: '2026-11-20T00:00:00Z', text: 'x', ...extra });

test('happy path: submitted -> ai_suggested -> ta_reviewed -> released', () => {
  let s = fresh();
  assert.equal(s.status, 'submitted');
  s = applySuggestion(s, ai([4, 4, 5]));
  assert.equal(s.status, 'ai_suggested');
  assert.equal(s.routing.toFaculty, false);
  s = applyTaReview(s, { by: 'ta_02', criteria: crit([5, 4, 5]), comment: 'Good', at: '2026-11-21T00:00:00Z' });
  assert.equal(s.status, 'released');
  assert.equal(s.ta.by, 'ta_02');
});

test('the AI never releases: release requires a TA review', () => {
  const s = applySuggestion(fresh(), ai([5, 5, 5]));
  assert.notEqual(s.status, 'released');
  assert.throws(() => applyFacultySignOff(s, { by: 'fac_01', at: 'x' }), GradingError);
  assert.throws(() => applyTaReview(fresh(), { by: 'ta', criteria: crit([1, 1, 1]) }), GradingError);
});

test('TA must score every AI criterion', () => {
  const s = applySuggestion(fresh(), ai([4, 4, 4]));
  assert.throws(() => applyTaReview(s, { by: 'ta_01', criteria: crit([4, 4]) }), /missing criteria: c3/);
});

test('routing to faculty: confidence < 0.6, flags, or TA-AI gap >= 2', () => {
  // Confidence exactly 0.6 is fine; 0.59 routes.
  assert.equal(routeToFaculty({ ai: ai([3, 3, 3], [0.6, 0.6, 0.6]) }).toFaculty, false);
  const low = routeToFaculty({ ai: ai([3, 3, 3], [0.59, 0.9, 0.9]) });
  assert.equal(low.toFaculty, true);
  assert.equal(low.reasons[0].code, 'low-confidence');

  const flagged = routeToFaculty({ ai: ai([3, 3, 3], undefined, ['possible-copy']) });
  assert.equal(flagged.reasons[0].code, 'flag');

  const gap1 = routeToFaculty({ ai: ai([3, 3, 3]), ta: { criteria: crit([4, 2, 3]) } });
  assert.equal(gap1.toFaculty, false);
  const gap2 = routeToFaculty({ ai: ai([3, 3, 3]), ta: { criteria: crit([5, 3, 3]) } });
  assert.equal(gap2.toFaculty, true);
  assert.equal(gap2.reasons[0].code, 'ta-ai-gap');
});

test('routed submissions wait in ta_reviewed for faculty sign-off', () => {
  let s = applySuggestion(fresh(), ai([2, 4, 4]));
  s = applyTaReview(s, { by: 'ta_01', criteria: crit([4, 4, 4]), at: '2026-11-21T00:00:00Z' });
  assert.equal(s.status, 'ta_reviewed');
  assert.equal(s.routing.toFaculty, true);
  s = applyFacultySignOff(s, { by: 'fac_01', criteria: crit([3, 4, 4]), comment: 'Calibrated', at: '2026-11-22T00:00:00Z' });
  assert.equal(s.status, 'released');
  assert.equal(s.faculty.signedOff, true);
  const view = studentView(s, rubric);
  assert.deepEqual(view.criteria, crit([3, 4, 4]));
  assert.equal(view.total, 11);
  assert.equal(view.max, 15);
  assert.equal(view.note, AI_NOTE);
});

test('final projects always need faculty sign-off', () => {
  let s = applySuggestion(fresh({ final: true }), ai([4, 4, 4]));
  s = applyTaReview(s, { by: 'ta_01', criteria: crit([4, 4, 4]) });
  assert.equal(s.status, 'ta_reviewed');
  assert.ok(s.routing.reasons.some((r) => r.code === 'final'));
});

test('students never see AI scores before release', () => {
  const s = applySuggestion(fresh(), ai([4, 4, 4]));
  const view = studentView(s, rubric);
  assert.equal(view.released, false);
  assert.equal(view.criteria, undefined);
});

test('quadratic weighted kappa', () => {
  assert.equal(quadraticWeightedKappa([0, 1, 2, 3, 4, 5], [0, 1, 2, 3, 4, 5], 0, 5), 1);
  // Known value: classic example with 3 categories.
  const a = [0, 0, 1, 1, 2, 2];
  const b = [0, 1, 1, 2, 2, 0];
  const k = quadraticWeightedKappa(a, b, 0, 2);
  // Observed weighted disagreement: (0.25+0.25+1)/6 = 0.25; expected (uniform marginals): 1/3 -> 1 - 0.75 = 0.25
  assert.ok(Math.abs(k - 0.25) < 1e-9, `got ${k}`);
  // Reversed ratings are worse than chance.
  assert.ok(quadraticWeightedKappa([0, 1, 2, 3, 4, 5], [5, 4, 3, 2, 1, 0], 0, 5) < 0);
  assert.equal(quadraticWeightedKappa([], [], 0, 5), null);
  assert.throws(() => quadraticWeightedKappa([1], [1, 2], 0, 5));
});

test('calibration compares AI and human scores', () => {
  const subs = [
    { ai: ai([4, 4, 4]), ta: { criteria: crit([4, 4, 4]) } },
    { ai: ai([2, 3, 5]), ta: { criteria: crit([3, 3, 5]) }, faculty: { criteria: crit([2, 3, 5]) } },
    { ai: ai([1, 1, 1]), ta: null },
  ];
  const c = calibration(subs, () => rubric);
  assert.equal(c.pairs, 6);
  assert.equal(c.exactAgreement, 1);
  assert.equal(c.qwk, 1);
});
