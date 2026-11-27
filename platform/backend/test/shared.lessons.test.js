import { test } from 'node:test';
import assert from 'node:assert/strict';
import { COMPETENCY_IDS, AGENTIC_SKILL_IDS, levelBand } from '../shared/competencies.js';
import { LESSONS, RUBRICS, getRubric, dueAt, weekForDate, calendar } from '../shared/lessons.js';
import { READINGS, getReading } from '../shared/readings.js';

test('competency ids and bands match SPEC', () => {
  assert.deepEqual(COMPETENCY_IDS, ['critical', 'design', 'computational', 'creativity', 'communication', 'aiconcepts', 'agentic', 'responsible']);
  assert.equal(AGENTIC_SKILL_IDS.length, 8);
  assert.equal(levelBand(0).name, 'Emerging');
  assert.equal(levelBand(39).name, 'Emerging');
  assert.equal(levelBand(40).name, 'Developing');
  assert.equal(levelBand(69).name, 'Developing');
  assert.equal(levelBand(70).name, 'Proficient');
  assert.equal(levelBand(89).name, 'Proficient');
  assert.equal(levelBand(90).name, 'Advanced');
  assert.equal(levelBand(100).name, 'Advanced');
  assert.equal(levelBand(null), null);
});

test('14 lessons with the SPEC titles and structure', () => {
  const titles = [
    'Check the number first', 'Judging AI output', 'Tools and keys', 'Tableau to Make', 'Reconcile before you chart',
    'Descriptive and diagnostic', 'Captions that say something', 'Forecasting', 'What-if and prescriptive',
    'Dashboard design', 'Workflows vs agents', 'Guardrails and the human gate', 'Evaluating agents', 'Final project demo',
  ];
  assert.equal(LESSONS.length, 14);
  LESSONS.forEach((l, i) => {
    assert.equal(l.week, i + 1);
    assert.equal(l.id, `w${i + 1}`);
    assert.equal(l.title, titles[i]);
    assert.ok(l.competencies.length >= 2 && l.competencies.length <= 3, `${l.id} has 2-3 competencies`);
    l.competencies.forEach((c) => assert.ok(COMPETENCY_IDS.includes(c)));
    assert.ok(l.activities.length >= 3 && l.activities.length <= 4, `${l.id} has 3-4 activities`);
    l.activities.forEach((a) => {
      assert.ok(a.xp > 0);
      assert.ok(a.id.startsWith(`${l.id}-`));
      if (a.reading) assert.ok(getReading(a.reading), `${a.reading} exists`);
      if (a.rubric) {
        const r = getRubric(a.rubric);
        assert.ok(r, `${a.rubric} exists`);
        r.criteria.forEach((c) => assert.ok(l.competencies.includes(c.competency), `${r.id}.${c.id} targets a lesson competency`));
      }
    });
    if (l.week >= 11) {
      assert.ok(l.competencies.includes('agentic'));
      assert.ok(l.agenticSkills.length > 0);
      l.agenticSkills.forEach((s) => assert.ok(AGENTIC_SKILL_IDS.includes(s)));
    } else {
      assert.equal(l.agenticSkills.length, 0);
    }
  });
});

test('week 12 matches the SPEC example', () => {
  const w12 = LESSONS[11];
  assert.deepEqual(w12.competencies, ['agentic', 'critical', 'responsible']);
  assert.deepEqual(w12.agenticSkills, ['ag-guardrails', 'ag-hitl']);
  assert.deepEqual(
    w12.activities.map((a) => [a.id, a.type, a.title, a.xp]),
    [
      ['w12-read', 'read', 'Reading 7.2', 20],
      ['w12-practice', 'practice', 'Check: injected instructions', 30],
      ['w12-lab', 'lab', 'Discount Desk lab', 150],
      ['w12-reflect', 'reflect', 'Where did your judgment change the outcome?', 20],
    ],
  );
  assert.equal(w12.activities[2].rubric, 'rubric-desk');
});

test('rubrics have unique ids and 5-point criteria', () => {
  assert.equal(new Set(RUBRICS.map((r) => r.id)).size, RUBRICS.length);
  RUBRICS.forEach((r) => r.criteria.forEach((c) => {
    assert.equal(c.max, 5);
    assert.ok(c.descriptors['5'] && c.descriptors['3'] && c.descriptors['1']);
  }));
  assert.equal(READINGS.length, 14);
});

test('calendar and week math', () => {
  const start = '2026-08-31';
  assert.equal(weekForDate('2026-08-31T10:00:00Z', start), 1);
  assert.equal(weekForDate('2026-11-20T15:02:11Z', start), 12);
  assert.equal(weekForDate('2027-03-01T00:00:00Z', start), 14);
  assert.equal(dueAt('w1-read', start), '2026-09-02T23:59:00.000Z');
  assert.equal(dueAt('w12-lab', start), '2026-11-22T23:59:00.000Z');
  assert.equal(calendar(start).length, LESSONS.reduce((s, l) => s + l.activities.length, 0));
});
