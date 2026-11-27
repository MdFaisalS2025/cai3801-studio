// Competency levels 0-100 from graded evidence only (SPEC: Competencies).
// Time spent, views, XP and points are never used. Pure module: no I/O.
//
// Evidence comes from two places:
//   1. Objective checks scored by code: events with verb "graded" and result.score in [0, 1]
//      on activities without a rubric. The item counts toward every competency of the lesson.
//   2. Released submissions: the human-confirmed rubric scores (faculty override, else TA).
//      Each criterion counts toward its rubric competency. AI-only suggestions never count.
//
// Level = recency-weighted mean of item scores x 100. The newest item has the highest weight
// (weights 1, 2, 3, ... from oldest to newest), so levels can rise and fall as work improves.

import { COMPETENCY_IDS, levelBand } from './competencies.js';
import { getActivity, getRubric, lessonForActivity } from './lessons.js';

const DAY_MS = 24 * 60 * 60 * 1000;

/** Evidence items from objective "graded" events. */
export function evidenceFromEvents(events) {
  const out = [];
  for (const e of events || []) {
    if (e.verb !== 'graded') continue;
    const score = e.result && typeof e.result.score === 'number' ? e.result.score : null;
    if (score === null || score < 0 || score > 1) continue;
    const lesson = lessonForActivity(e.object);
    if (!lesson) continue;
    // Rubric-graded work counts through its released submission, not through events.
    const activity = getActivity(e.object);
    if (activity && activity.rubric) continue;
    for (const c of lesson.competencies) {
      out.push({ itemId: e.id || `${e.object}@${e.ts}`, source: e.object, competency: c, score, at: e.ts });
    }
  }
  return out;
}

/** Final human-confirmed criteria for a submission, or null if not released. */
export function finalCriteria(submission) {
  if (!submission || submission.status !== 'released') return null;
  const fac = submission.faculty && Array.isArray(submission.faculty.criteria) ? submission.faculty.criteria : null;
  const ta = submission.ta && Array.isArray(submission.ta.criteria) ? submission.ta.criteria : null;
  return fac || ta;
}

/** Evidence items from one released submission. */
export function evidenceFromSubmission(submission, rubric) {
  const criteria = finalCriteria(submission);
  if (!criteria || !rubric) return [];
  const byComp = new Map();
  for (const c of criteria) {
    const rc = rubric.criteria.find((r) => r.id === c.id);
    if (!rc || typeof c.score !== 'number') continue;
    const frac = Math.max(0, Math.min(1, c.score / rc.max));
    if (!byComp.has(rc.competency)) byComp.set(rc.competency, []);
    byComp.get(rc.competency).push(frac);
  }
  const at = (submission.faculty && submission.faculty.at) || (submission.ta && submission.ta.at) || submission.submittedAt;
  return [...byComp.entries()].map(([competency, fracs]) => ({
    itemId: submission.id,
    source: submission.activity,
    competency,
    score: fracs.reduce((a, b) => a + b, 0) / fracs.length,
    at,
  }));
}

/** All evidence for one student: objective graded events plus released submissions. */
export function collectEvidence({ events = [], submissions = [] }) {
  const ev = evidenceFromEvents(events);
  for (const s of submissions) {
    const activity = getActivity(s.activity);
    const rubric = activity && activity.rubric ? getRubric(activity.rubric) : null;
    ev.push(...evidenceFromSubmission(s, rubric));
  }
  return ev;
}

/**
 * Levels per competency. Returns { [competency]: { level, band, items } }.
 * level is null (and band null) when there is no evidence yet.
 * Pass asOf to ignore evidence after that moment.
 */
export function computeLevels(evidence, { asOf } = {}) {
  const cutoff = asOf ? Date.parse(asOf) : Infinity;
  const out = {};
  for (const id of COMPETENCY_IDS) {
    const items = (evidence || [])
      .filter((e) => e.competency === id && (!e.at || Date.parse(e.at) <= cutoff))
      .sort((a, b) => Date.parse(a.at || 0) - Date.parse(b.at || 0));
    const distinct = new Set(items.map((i) => i.itemId)).size;
    if (items.length === 0) {
      out[id] = { level: null, band: null, items: 0 };
      continue;
    }
    let num = 0;
    let den = 0;
    items.forEach((it, i) => {
      const w = i + 1;
      num += it.score * w;
      den += w;
    });
    const level = Math.round((num / den) * 100);
    out[id] = { level, band: levelBand(level).name, items: distinct };
  }
  return out;
}

/** Drop in level per competency compared with `days` ago (positive number = drop). */
export function levelDrops(evidence, now, days = 14) {
  const before = computeLevels(evidence, { asOf: new Date(Date.parse(now) - days * DAY_MS).toISOString() });
  const after = computeLevels(evidence, { asOf: now });
  const out = {};
  for (const id of COMPETENCY_IDS) {
    const b = before[id].level;
    const a = after[id].level;
    out[id] = b === null || a === null ? 0 : b - a;
  }
  return out;
}
