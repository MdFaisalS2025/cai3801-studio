import { test } from 'node:test';
import assert from 'node:assert/strict';
import { evidenceFromEvents, evidenceFromSubmission, collectEvidence, computeLevels, levelDrops } from '../shared/competencyScore.js';
import { getRubric } from '../shared/lessons.js';

const graded = (object, score, ts, id) => ({ id: id || `e-${object}-${ts}`, actor: 's', verb: 'graded', object, ts, result: { score } });

test('no evidence gives null levels, not zero', () => {
  const levels = computeLevels([]);
  assert.equal(levels.critical.level, null);
  assert.equal(levels.critical.band, null);
  assert.equal(levels.critical.items, 0);
});

test('only graded evidence counts: views, time spent and completions are ignored', () => {
  const events = [
    { id: '1', verb: 'viewed', object: 'w1-read', ts: '2026-09-01T00:00:00Z' },
    { id: '2', verb: 'completed', object: 'w1-practice', ts: '2026-09-02T00:00:00Z', result: { durationSec: 99999, score: 1 } },
    { id: '3', verb: 'asked', object: 'w1-read', ts: '2026-09-02T00:00:00Z' },
  ];
  assert.equal(evidenceFromEvents(events).length, 0);
  assert.equal(computeLevels(evidenceFromEvents(events)).critical.level, null);
});

test('objective checks count toward every lesson competency; rubric activities do not count via events', () => {
  const ev = evidenceFromEvents([graded('w1-practice', 0.8, '2026-09-03T00:00:00Z'), graded('w1-lab', 1, '2026-09-04T00:00:00Z')]);
  assert.deepEqual(ev.map((e) => e.competency).sort(), ['aiconcepts', 'critical']);
  const levels = computeLevels(ev);
  assert.equal(levels.critical.level, 80);
  assert.equal(levels.critical.band, 'Proficient');
  assert.equal(levels.design.level, null);
});

test('released submissions use human scores; unreleased AI suggestions never count', () => {
  const rubric = getRubric('rubric-desk');
  const base = {
    id: 'sub1', activity: 'w12-lab', submittedAt: '2026-11-20T00:00:00Z',
    ai: { criteria: [{ id: 'c1', score: 5 }, { id: 'c2', score: 5 }, { id: 'c3', score: 5 }] },
    ta: { by: 'ta_01', at: '2026-11-21T00:00:00Z', criteria: [{ id: 'c1', score: 2 }, { id: 'c2', score: 4 }, { id: 'c3', score: 5 }] },
  };
  assert.equal(evidenceFromSubmission({ ...base, status: 'ai_suggested' }, rubric).length, 0);
  assert.equal(evidenceFromSubmission({ ...base, status: 'ta_reviewed' }, rubric).length, 0);
  const ev = evidenceFromSubmission({ ...base, status: 'released' }, rubric);
  const byComp = Object.fromEntries(ev.map((e) => [e.competency, e.score]));
  assert.deepEqual(byComp, { critical: 0.4, agentic: 0.8, responsible: 1 });
  // Faculty override wins.
  const fac = evidenceFromSubmission({ ...base, status: 'released', faculty: { signedOff: true, criteria: [{ id: 'c1', score: 5 }, { id: 'c2', score: 5 }, { id: 'c3', score: 5 }] } }, rubric);
  assert.ok(fac.every((e) => e.score === 1));
  const all = collectEvidence({ events: [], submissions: [{ ...base, status: 'released' }] });
  assert.equal(computeLevels(all).critical.level, 40);
});

test('levels are recency weighted and stay within 0-100', () => {
  const ev = evidenceFromEvents([
    graded('w1-practice', 0, '2026-09-03T00:00:00Z'),
    graded('w2-practice', 1, '2026-09-10T00:00:00Z'),
  ]);
  // weights 1 (old, 0) and 2 (new, 1) -> 2/3
  assert.equal(computeLevels(ev).critical.level, 67);
  assert.equal(computeLevels(ev).critical.items, 2);
  assert.equal(computeLevels(ev, { asOf: '2026-09-05T00:00:00Z' }).critical.level, 0);
});

test('levelDrops reports a fall over 14 days', () => {
  const ev = evidenceFromEvents([
    graded('w1-practice', 1, '2026-09-03T00:00:00Z'),
    graded('w2-practice', 1, '2026-09-10T00:00:00Z'),
    graded('w5-practice', 0, '2026-10-01T00:00:00Z'),
    graded('w6-practice', 0, '2026-10-08T00:00:00Z'),
  ]);
  const drops = levelDrops(ev, '2026-10-10T00:00:00Z');
  assert.equal(drops.critical, 100 - 30); // before: 100; after: (1+2)/10 = 30
  assert.equal(drops.design, 0);
});
