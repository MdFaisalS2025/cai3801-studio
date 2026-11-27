import { test } from 'node:test';
import assert from 'node:assert/strict';
import { totalXp, levelForXp, weeklyQuest, streaks, vsLastWeek, badges, gamifySummary } from '../shared/gamify.js';

const ev = (verb, object, week, ts = `2026-09-0${Math.min(9, week)}T00:00:00Z`) => ({ id: `${verb}-${object}`, verb, object, week, ts });

test('XP counts each completed or submitted activity once', () => {
  const events = [
    ev('viewed', 'w1-read', 1),
    ev('completed', 'w1-read', 1),
    ev('completed', 'w1-read', 1),
    ev('completed', 'w1-practice', 1),
    ev('submitted', 'w1-lab', 1),
    ev('started', 'w1-reflect', 1),
  ];
  assert.equal(totalXp(events), 20 + 30 + 150);
});

test('levels every 500 XP', () => {
  assert.deepEqual(levelForXp(0), { level: 1, xp: 0, intoLevel: 0, toNextLevel: 500 });
  assert.equal(levelForXp(499).level, 1);
  assert.equal(levelForXp(500).level, 2);
  assert.equal(levelForXp(1250).level, 3);
  assert.equal(levelForXp(1250).toNextLevel, 250);
});

test('weekly quest progress ring', () => {
  const q = weeklyQuest([ev('completed', 'w12-read', 12), ev('completed', 'w12-practice', 12)], 12);
  assert.equal(q.total, 4);
  assert.equal(q.done, 2);
  assert.equal(q.progress, 0.5);
  assert.equal(q.complete, false);
});

test('streaks count weeks, with a grace period for the current week', () => {
  const events = [1, 2, 3, 5, 6, 7, 8].map((w) => ev('completed', `w${w}-read`, w));
  assert.deepEqual(streaks(events, 8).current, 4);
  assert.deepEqual(streaks(events, 9).current, 4); // week 9 not started yet
  assert.deepEqual(streaks(events, 10).current, 0); // missed week 9
  assert.equal(streaks(events, 8).longest, 4);
  // Many events in one week still count as one week.
  const oneWeek = [ev('completed', 'w3-read', 3), ev('completed', 'w3-practice', 3), ev('submitted', 'w3-lab', 3)];
  assert.equal(streaks(oneWeek, 3).current, 1);
});

test('you vs last week and personal best, no ranking', () => {
  const events = [ev('completed', 'w1-read', 1), ev('submitted', 'w1-lab', 1), ev('completed', 'w2-read', 2)];
  const v = vsLastWeek(events, 2);
  assert.equal(v.thisWeek, 20);
  assert.equal(v.lastWeek, 170);
  assert.equal(v.change, -150);
  assert.deepEqual(v.personalBest, { week: 1, xp: 170 });
});

test('badges for competency milestones and agentic skills', () => {
  const levels = { critical: { level: 92 }, design: { level: 71 }, agentic: { level: 50 } };
  const b = badges({ events: [ev('submitted', 'w12-lab', 12)], levels, currentWeek: 12 });
  const names = b.map((x) => x.name);
  assert.ok(names.includes('Proficient: Critical thinking'));
  assert.ok(names.includes('Advanced: Critical thinking'));
  assert.ok(names.includes('Proficient: Design thinking'));
  assert.ok(!names.some((n) => n.includes('Agentic AI skills')));
  assert.ok(names.includes('Guardrail Builder'));
  assert.ok(names.includes('Human in the Loop'));
});

test('summary says XP never counts toward the grade', () => {
  const s = gamifySummary({ events: [], levels: {}, currentWeek: 1 });
  assert.equal(s.countsTowardGrade, false);
  assert.equal(s.level, 1);
});
