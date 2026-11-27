// Gamification (SPEC: Gamification). XP never counts toward the grade. No leaderboard here:
// only personal progress, personal best and "you vs last week". Pure module: no I/O.

import { COMPETENCIES } from './competencies.js';
import { LESSONS, getActivity } from './lessons.js';

export const XP_PER_LEVEL = 500;
const XP_VERBS = new Set(['completed', 'submitted']);

export const SKILL_BADGES = Object.freeze({
  'ag-tools': 'Tool Smith',
  'ag-instructions': 'Policy Writer',
  'ag-guardrails': 'Guardrail Builder',
  'ag-hitl': 'Human in the Loop',
  'ag-eval': 'Test Set Builder',
  'ag-trace': 'Trace Reader',
  'ag-cost': 'Cost Cutter',
  'ag-mcp': 'MCP Connector',
});

/** Activities that earned XP, each counted once (first completion wins). */
function xpActivities(events) {
  const seen = new Map();
  const sorted = [...(events || [])].sort((a, b) => Date.parse(a.ts) - Date.parse(b.ts));
  for (const e of sorted) {
    if (!XP_VERBS.has(e.verb) || seen.has(e.object)) continue;
    const a = getActivity(e.object);
    if (a) seen.set(e.object, { activity: a, week: e.week, ts: e.ts });
  }
  return [...seen.values()];
}

export function totalXp(events) {
  return xpActivities(events).reduce((s, x) => s + x.activity.xp, 0);
}

export function levelForXp(xp) {
  const level = Math.floor(xp / XP_PER_LEVEL) + 1;
  const into = xp % XP_PER_LEVEL;
  return { level, xp, intoLevel: into, toNextLevel: XP_PER_LEVEL - into };
}

function lessonWeekOf(activityId) {
  const l = LESSONS.find((x) => x.activities.some((a) => a.id === activityId));
  return l ? l.week : null;
}

/** Progress ring for one week's quest (the lesson's 3-4 activities). */
export function weeklyQuest(events, week) {
  const lesson = LESSONS.find((l) => l.week === week);
  if (!lesson) return null;
  const doneIds = new Set(xpActivities(events).map((x) => x.activity.id));
  const items = lesson.activities.map((a) => ({ id: a.id, title: a.title, xp: a.xp, done: doneIds.has(a.id) }));
  const done = items.filter((i) => i.done).length;
  return { week, lessonId: lesson.id, title: lesson.title, done, total: items.length, progress: done / items.length, complete: done === items.length, items };
}

/**
 * Streaks count weeks, not days. A week counts when the student completed or submitted at
 * least one activity that week (by event.week). The current week gets a grace period: if it has
 * no activity yet, the streak is counted from the previous week.
 */
export function streaks(events, currentWeek) {
  const active = new Set(
    (events || []).filter((e) => XP_VERBS.has(e.verb)).map((e) => e.week ?? lessonWeekOf(e.object)).filter(Boolean),
  );
  let current = 0;
  let w = active.has(currentWeek) ? currentWeek : currentWeek - 1;
  while (w >= 1 && active.has(w)) {
    current += 1;
    w -= 1;
  }
  let longest = 0;
  let run = 0;
  for (let i = 1; i <= 14; i += 1) {
    run = active.has(i) ? run + 1 : 0;
    longest = Math.max(longest, run);
  }
  return { current, longest, activeWeeks: [...active].sort((a, b) => a - b) };
}

/** XP earned this week vs last week, plus the personal best week. */
export function vsLastWeek(events, currentWeek) {
  const byWeek = new Map();
  for (const x of xpActivities(events)) {
    const w = x.week ?? lessonWeekOf(x.activity.id);
    byWeek.set(w, (byWeek.get(w) || 0) + x.activity.xp);
  }
  const thisWeek = byWeek.get(currentWeek) || 0;
  const lastWeek = byWeek.get(currentWeek - 1) || 0;
  let bestWeek = null;
  for (const [w, xp] of byWeek) if (!bestWeek || xp > bestWeek.xp) bestWeek = { week: w, xp };
  return { thisWeek, lastWeek, change: thisWeek - lastWeek, personalBest: bestWeek };
}

/** Badges from competency milestones (graded evidence) and agentic skills (lab submitted). */
export function badges({ events = [], levels = {}, currentWeek = 14 }) {
  const out = [];
  for (const c of COMPETENCIES) {
    const v = levels[c.id];
    if (!v || v.level === null) continue;
    if (v.level >= 70) out.push({ id: `comp-${c.id}-proficient`, name: `Proficient: ${c.name}`, kind: 'competency' });
    if (v.level >= 90) out.push({ id: `comp-${c.id}-advanced`, name: `Advanced: ${c.name}`, kind: 'competency' });
  }
  const submitted = new Set(events.filter((e) => e.verb === 'submitted').map((e) => e.object));
  const skills = new Set();
  for (const l of LESSONS) {
    if (!l.agenticSkills.length) continue;
    if (l.activities.some((a) => a.rubric && submitted.has(a.id))) l.agenticSkills.forEach((s) => skills.add(s));
  }
  for (const s of skills) out.push({ id: `skill-${s}`, name: SKILL_BADGES[s], kind: 'agentic-skill', skill: s });
  const st = streaks(events, currentWeek);
  if (st.longest >= 3) out.push({ id: 'streak-3', name: '3-week streak', kind: 'streak' });
  if (st.longest >= 6) out.push({ id: 'streak-6', name: '6-week streak', kind: 'streak' });
  return out;
}

/** Everything the student dashboard needs from gamification. */
export function gamifySummary({ events = [], levels = {}, currentWeek }) {
  const xp = totalXp(events);
  return {
    ...levelForXp(xp),
    quest: weeklyQuest(events, currentWeek),
    streak: streaks(events, currentWeek),
    vsLastWeek: vsLastWeek(events, currentWeek),
    badges: badges({ events, levels, currentWeek }),
    countsTowardGrade: false,
  };
}
