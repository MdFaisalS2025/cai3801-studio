import { test } from 'node:test';
import assert from 'node:assert/strict';
import { recommend, atRisk, missedSubmissions } from '../shared/recommend.js';
import { computeLevels } from '../shared/competencyScore.js';
import { calendar } from '../shared/lessons.js';

const NOW = '2026-11-20T18:00:00.000Z';
const hoursAgo = (h) => new Date(Date.parse(NOW) - h * 3600 * 1000).toISOString();
const daysAgo = (d) => hoursAgo(d * 24);
const ev = (verb, object, ts, extra = {}) => ({ id: `${verb}-${object}-${ts}`, actor: 'stu_x', verb, object, ts, ...extra });
const noLevels = computeLevels([]);
const lv = (over) => ({ ...noLevels, ...over });
const active = [ev('viewed', 'w12-read', hoursAgo(5))];

test('R1: activity due in <= 2 days and not started', () => {
  const upcoming = [
    { activityId: 'w12-practice', title: 'Check: injected instructions', dueAt: '2026-11-22T12:00:00.000Z' }, // 1.75 days
    { activityId: 'w12-lab', title: 'Discount Desk lab', dueAt: '2026-11-25T12:00:00.000Z' }, // 4.75 days
  ];
  const { recommendations } = recommend({ now: NOW, events: active, levels: noLevels, upcoming, currentWeek: 12 });
  assert.equal(recommendations.length, 1);
  const r = recommendations[0];
  assert.equal(r.rule, 'R1');
  assert.equal(r.activityId, 'w12-practice');
  assert.equal(r.title, 'Start Check: injected instructions: due in 2 days');
  assert.match(r.reason, /not started/);

  const started = recommend({ now: NOW, events: [...active, ev('started', 'w12-practice', hoursAgo(1))], levels: noLevels, upcoming, currentWeek: 12 });
  assert.equal(started.recommendations.length, 0);
});

test('R2: weak competency needs level < 40 and at least 2 graded items', () => {
  const one = recommend({ now: NOW, events: active, levels: lv({ critical: { level: 20, band: 'Emerging', items: 1 } }), currentWeek: 12 });
  assert.equal(one.recommendations.length, 0);
  const two = recommend({ now: NOW, events: active, levels: lv({ critical: { level: 35, band: 'Emerging', items: 2 } }), currentWeek: 12 });
  assert.equal(two.recommendations.length, 1);
  const r = two.recommendations[0];
  assert.equal(r.rule, 'R2');
  assert.equal(r.activityId, 'w12-practice'); // next lesson activity that targets critical
  assert.match(r.reason, /Critical thinking level is 35 \(Emerging\), based on 2 graded items/);
  const at40 = recommend({ now: NOW, events: active, levels: lv({ critical: { level: 40, band: 'Developing', items: 5 } }), currentWeek: 12 });
  assert.equal(at40.recommendations.length, 0);
});

test('R2: falls back to a practice set when no later lesson targets the competency', () => {
  const { recommendations } = recommend({ now: NOW, events: active, levels: lv({ design: { level: 10, band: 'Emerging', items: 3 } }), currentWeek: 12 });
  assert.equal(recommendations[0].activityId, 'practice-design');
  assert.equal(recommendations[0].title, 'Practice set: Design thinking');
});

test('R3: no events for 5+ days suggests a 10-minute activity', () => {
  const four = recommend({ now: NOW, events: [ev('viewed', 'w11-read', daysAgo(4.9))], levels: noLevels, currentWeek: 12 });
  assert.equal(four.recommendations.length, 0);
  const five = recommend({ now: NOW, events: [ev('viewed', 'w11-read', daysAgo(5))], levels: noLevels, currentWeek: 12 });
  assert.equal(five.recommendations.length, 1);
  const r = five.recommendations[0];
  assert.equal(r.rule, 'R3');
  assert.match(r.title, /10 minutes/);
  assert.match(r.reason, /in 5 days/);
  const none = recommend({ now: NOW, events: [], levels: noLevels, currentWeek: 12 });
  assert.equal(none.recommendations[0].rule, 'R3');
});

test('R4: 3+ tutor questions on one reading without its check', () => {
  const asks = [1, 2, 3].map((h) => ev('asked', 'w12-read', hoursAgo(h)));
  const two = recommend({ now: NOW, events: asks.slice(0, 2), levels: noLevels, currentWeek: 12 });
  assert.equal(two.recommendations.length, 0);
  const three = recommend({ now: NOW, events: asks, levels: noLevels, currentWeek: 12 });
  const r = three.recommendations[0];
  assert.equal(r.rule, 'R4');
  assert.equal(r.activityId, 'w12-practice');
  assert.equal(r.officeHours, true);
  assert.match(r.reason, /3 questions about "Reading 7.2"/);
  assert.match(r.reason, /office hours/);
  const checked = recommend({ now: NOW, events: [...asks, ev('completed', 'w12-practice', hoursAgo(0.5))], levels: noLevels, currentWeek: 12 });
  assert.equal(checked.recommendations.length, 0);
});

test('R5: strength >= 85 offers an optional challenge quest', () => {
  const { recommendations } = recommend({ now: NOW, events: active, levels: lv({ agentic: { level: 85, band: 'Proficient', items: 3 } }), currentWeek: 12 });
  assert.equal(recommendations.length, 1);
  assert.equal(recommendations[0].rule, 'R5');
  assert.equal(recommendations[0].optional, true);
  assert.match(recommendations[0].reason, /does not affect your grade/);
  const below = recommend({ now: NOW, events: active, levels: lv({ agentic: { level: 84, band: 'Proficient', items: 3 } }), currentWeek: 12 });
  assert.equal(below.recommendations.length, 0);
});

test('at most 3 recommendations, priority order, every one has a reason', () => {
  const levels = lv({
    critical: { level: 20, band: 'Emerging', items: 4 },
    design: { level: 30, band: 'Emerging', items: 4 },
    agentic: { level: 95, band: 'Advanced', items: 4 },
  });
  const upcoming = [{ activityId: 'w12-reflect', title: 'Reflect', dueAt: '2026-11-21T12:00:00.000Z' }];
  const { recommendations, fired } = recommend({ now: NOW, events: [], levels, upcoming, currentWeek: 12 });
  assert.ok(fired.length > 3);
  assert.equal(recommendations.length, 3);
  assert.equal(recommendations[0].rule, 'R1');
  recommendations.forEach((r) => assert.ok(typeof r.reason === 'string' && r.reason.length > 20));
});

test('rules pointing at the same activity are merged with both reasons', () => {
  const asks = [1, 2, 3].map((h) => ev('asked', 'w12-read', hoursAgo(h)));
  const upcoming = [{ activityId: 'w12-practice', title: 'Check: injected instructions', dueAt: '2026-11-21T12:00:00.000Z' }];
  const { recommendations } = recommend({ now: NOW, events: asks, levels: noLevels, upcoming, currentWeek: 12 });
  assert.equal(recommendations.length, 1);
  assert.deepEqual(recommendations[0].rules, ['R1', 'R4']);
  assert.match(recommendations[0].reason, /not started.*tutor/s);
});

test('events older than 14 days are ignored', () => {
  const old = [1, 2, 3].map((d) => ev('asked', 'w10-read', daysAgo(15 + d)));
  const { recommendations } = recommend({ now: NOW, events: [...active, ...old], levels: noLevels, currentWeek: 12 });
  assert.equal(recommendations.length, 0);
});

test('at-risk: inactivity, two missed submissions, or a 20-point drop; informs only', () => {
  const cal = calendar('2026-08-31');
  const allSubmitted = cal.filter((c) => Date.parse(c.dueAt) < Date.parse(NOW)).map((c) => ev('submitted', c.activityId, c.dueAt));
  const fine = atRisk({ now: NOW, events: [...allSubmitted, ...active], calendar: cal, drops: { critical: 19 } });
  assert.deepEqual(fine, { atRisk: false, reasons: [] });

  const inactive = atRisk({ now: NOW, events: allSubmitted.filter((e) => Date.parse(e.ts) < Date.parse(daysAgo(6))), calendar: cal, drops: {} });
  assert.ok(inactive.reasons.some((r) => r.code === 'inactive'));

  const missingOne = allSubmitted.filter((e) => e.object !== 'w10-lab');
  assert.equal(missedSubmissions(missingOne, cal, NOW).length, 1);
  assert.equal(atRisk({ now: NOW, events: [...missingOne, ...active], calendar: cal }).atRisk, false);
  const missingTwo = missingOne.filter((e) => e.object !== 'w11-lab');
  const two = atRisk({ now: NOW, events: [...missingTwo, ...active], calendar: cal });
  assert.equal(two.atRisk, true);
  assert.equal(two.reasons[0].code, 'missed-submissions');

  const drop = atRisk({ now: NOW, events: [...allSubmitted, ...active], calendar: cal, drops: { design: 20 } });
  assert.equal(drop.reasons[0].code, 'competency-drop');
  assert.match(drop.reasons[0].text, /Design thinking dropped 20 points/);
});
