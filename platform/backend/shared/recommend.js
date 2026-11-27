// Transparent rule engine for next steps (SPEC: Recommendations R1-R5) and the TA at-risk flag.
// Every recommendation carries a plain-English reason. Pure module: no I/O.
// Flags only inform a human; nothing here acts on a student.

import { competencyName } from './competencies.js';
import { LESSONS, getActivity, lessonForActivity, isSubmittable } from './lessons.js';

const DAY_MS = 24 * 60 * 60 * 1000;
export const WINDOW_DAYS = 14;
export const MAX_RECOMMENDATIONS = 3;
export const INACTIVE_DAYS = 5;
export const WEAK_LEVEL = 40;
export const WEAK_MIN_ITEMS = 2;
export const STRONG_LEVEL = 85;
export const TUTOR_LOOP_QUESTIONS = 3;
export const DUE_SOON_DAYS = 2;
export const MISSED_SUBMISSIONS_FLAG = 2;
export const DROP_FLAG_POINTS = 20;

// Rule order decides which recommendations win when more than 3 fire.
const PRIORITY = { R1: 1, R4: 2, R3: 3, R2: 4, R5: 5 };

const TOUCH_VERBS = new Set(['started', 'completed', 'submitted', 'graded']);
const DONE_VERBS = new Set(['completed', 'submitted', 'graded']);

function plural(n, word) {
  return `${n} ${word}${n === 1 ? '' : 's'}`;
}

export function recentEvents(events, now, days = WINDOW_DAYS) {
  const from = Date.parse(now) - days * DAY_MS;
  const to = Date.parse(now);
  return (events || []).filter((e) => {
    const t = Date.parse(e.ts);
    return t >= from && t <= to;
  });
}

function touched(events) {
  return new Set(events.filter((e) => TOUCH_VERBS.has(e.verb)).map((e) => e.object));
}

function done(events) {
  return new Set(events.filter((e) => DONE_VERBS.has(e.verb)).map((e) => e.object));
}

/** Days since the last event, or Infinity if there is none. */
export function daysSinceLastEvent(events, now) {
  const times = (events || []).map((e) => Date.parse(e.ts)).filter((t) => t <= Date.parse(now));
  if (times.length === 0) return Infinity;
  return (Date.parse(now) - Math.max(...times)) / DAY_MS;
}

function r1Overdue({ now, recent, upcoming }) {
  const started = touched(recent);
  const out = [];
  for (const u of upcoming || []) {
    const daysLeft = (Date.parse(u.dueAt) - Date.parse(now)) / DAY_MS;
    if (daysLeft < 0 || daysLeft > DUE_SOON_DAYS) continue;
    if (started.has(u.activityId)) continue;
    const when = daysLeft < 1 ? 'due in less than 1 day' : `due in ${plural(Math.ceil(daysLeft), 'day')}`;
    const title = u.title || (getActivity(u.activityId) || {}).title || u.activityId;
    out.push({
      rule: 'R1',
      kind: 'due-soon',
      activityId: u.activityId,
      title: `Start ${title}: ${when}`,
      reason: `"${title}" is ${when} and you have not started it yet.`,
      sortKey: daysLeft,
    });
  }
  return out.sort((a, b) => a.sortKey - b.sortKey).map(({ sortKey, ...r }) => r);
}

function r2Weak({ levels, recent, currentWeek }) {
  const completed = done(recent);
  const out = [];
  for (const [comp, v] of Object.entries(levels || {})) {
    if (v.level === null || v.level >= WEAK_LEVEL || v.items < WEAK_MIN_ITEMS) continue;
    const name = competencyName(comp);
    const lesson = LESSONS.find((l) => l.week >= currentWeek && l.competencies.includes(comp));
    const candidate = lesson
      ? lesson.activities.find((a) => a.type === 'practice' && !completed.has(a.id)) ||
        lesson.activities.find((a) => !completed.has(a.id))
      : null;
    const base = `Your ${name} level is ${v.level} (${v.band}), based on ${plural(v.items, 'graded item')}.`;
    if (candidate) {
      out.push({
        rule: 'R2',
        kind: 'weak-competency',
        competency: comp,
        activityId: candidate.id,
        title: candidate.title,
        reason: `${base} "${candidate.title}" in week ${lesson.week} practises it.`,
      });
    } else {
      out.push({
        rule: 'R2',
        kind: 'weak-competency',
        competency: comp,
        activityId: `practice-${comp}`,
        title: `Practice set: ${name}`,
        reason: `${base} A short practice set will help before the next graded item.`,
      });
    }
  }
  return out.sort((a, b) => levels[a.competency].level - levels[b.competency].level);
}

function r3Inactive({ now, events, recent, currentWeek }) {
  const days = daysSinceLastEvent(events, now);
  if (days < INACTIVE_DAYS) return [];
  const completed = done(recent);
  const short = (a) => a.minutes <= 10 && !completed.has(a.id);
  let pick = null;
  for (let w = currentWeek; w >= 1 && !pick; w -= 1) {
    const l = LESSONS.find((x) => x.week === w);
    pick = l ? l.activities.find(short) : null;
  }
  const since = Number.isFinite(days) ? `in ${plural(Math.floor(days), 'day')}` : 'in the last 14 days';
  return [{
    rule: 'R3',
    kind: 'restart',
    activityId: pick ? pick.id : null,
    title: pick ? `${pick.title} (10 minutes)` : 'A 10-minute warm-up',
    reason: `We have not seen any activity from you ${since}. A 10-minute activity is an easy way back in.`,
  }];
}

function r4TutorLoop({ recent }) {
  const completed = done(recent);
  const counts = new Map();
  for (const e of recent) {
    if (e.verb !== 'asked') continue;
    counts.set(e.object, (counts.get(e.object) || 0) + 1);
  }
  const out = [];
  for (const [object, n] of counts) {
    if (n < TUTOR_LOOP_QUESTIONS) continue;
    const lesson = lessonForActivity(object);
    if (!lesson) continue;
    const check = lesson.activities.find((a) => a.type === 'practice');
    if (!check || completed.has(check.id)) continue;
    const reading = getActivity(object);
    out.push({
      rule: 'R4',
      kind: 'tutor-loop',
      activityId: check.id,
      title: `Do the check: ${check.title}`,
      officeHours: true,
      reason: `You asked the tutor ${n} questions about "${reading ? reading.title : object}" but have not done its check. The check shows what you already know. If it still feels unclear, book office hours.`,
    });
  }
  return out;
}

function r5Strength({ levels }) {
  const out = [];
  for (const [comp, v] of Object.entries(levels || {})) {
    if (v.level === null || v.level < STRONG_LEVEL) continue;
    const name = competencyName(comp);
    out.push({
      rule: 'R5',
      kind: 'challenge',
      competency: comp,
      activityId: `challenge-${comp}`,
      title: `Optional challenge quest: ${name}`,
      optional: true,
      reason: `Your ${name} level is ${v.level} (${v.band}). This optional quest stretches it further and does not affect your grade.`,
    });
  }
  return out.sort((a, b) => levels[b.competency].level - levels[a.competency].level);
}

/**
 * Next steps for one student.
 * @param {object} input
 * @param {string} input.now ISO time
 * @param {object[]} input.events the student's events (only the last 14 days are used)
 * @param {object} input.levels output of computeLevels
 * @param {{activityId:string,title?:string,dueAt:string}[]} input.upcoming activities with due dates
 * @param {number} input.currentWeek
 * @returns {{ recommendations: object[], fired: object[] }}
 */
export function recommend({ now, events = [], levels = {}, upcoming = [], currentWeek = 1 }) {
  const recent = recentEvents(events, now);
  const ctx = { now, events: recent, recent, levels, upcoming, currentWeek };
  const fired = [
    ...r1Overdue(ctx),
    ...r4TutorLoop(ctx),
    ...r3Inactive(ctx),
    ...r2Weak(ctx),
    ...r5Strength(ctx),
  ].sort((a, b) => PRIORITY[a.rule] - PRIORITY[b.rule]);

  // When two rules point at the same activity, merge them into one step that keeps both
  // reasons, so the student sees one clear action and every rule that led to it.
  const byKey = new Map();
  for (const r of fired) {
    const key = r.activityId || `${r.rule}-${r.competency || ''}`;
    const prev = byKey.get(key);
    if (prev) {
      prev.rules.push(r.rule);
      prev.reason = `${prev.reason} ${r.reason}`;
      if (r.officeHours) prev.officeHours = true;
      continue;
    }
    byKey.set(key, { ...r, rules: [r.rule] });
  }
  const recommendations = [...byKey.values()].slice(0, MAX_RECOMMENDATIONS);
  return { recommendations, fired };
}

/** Submittable activities whose due date has passed without a "submitted" event. */
export function missedSubmissions(events, calendar, now) {
  const submitted = new Set((events || []).filter((e) => e.verb === 'submitted').map((e) => e.object));
  return (calendar || []).filter((c) => {
    const a = getActivity(c.activityId);
    return isSubmittable(a) && Date.parse(c.dueAt) < Date.parse(now) && !submitted.has(c.activityId);
  });
}

/**
 * At-risk flag for the TA view: R3 (inactive 5+ days), or 2+ missed submissions,
 * or a 20-point drop in any competency. Informs a human only.
 * @param {object} input
 * @param {string} input.now
 * @param {object[]} input.events all of the student's events
 * @param {object[]} input.calendar output of lessons.calendar()
 * @param {object} input.drops output of competencyScore.levelDrops
 */
export function atRisk({ now, events = [], calendar = [], drops = {} }) {
  const reasons = [];
  const days = daysSinceLastEvent(events, now);
  if (days >= INACTIVE_DAYS) {
    reasons.push({
      code: 'inactive',
      text: Number.isFinite(days) ? `No activity for ${plural(Math.floor(days), 'day')}.` : 'No activity recorded.',
    });
  }
  const missed = missedSubmissions(events, calendar, now);
  if (missed.length >= MISSED_SUBMISSIONS_FLAG) {
    reasons.push({ code: 'missed-submissions', text: `${plural(missed.length, 'missed submission')}: ${missed.map((m) => m.activityId).join(', ')}.` });
  }
  for (const [comp, drop] of Object.entries(drops)) {
    if (drop >= DROP_FLAG_POINTS) {
      reasons.push({ code: 'competency-drop', competency: comp, text: `${competencyName(comp)} dropped ${drop} points in ${WINDOW_DAYS} days.` });
    }
  }
  return { atRisk: reasons.length > 0, reasons };
}
