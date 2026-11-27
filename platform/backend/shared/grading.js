// Hybrid grading state machine (SPEC: Hybrid grading rules). Pure module: no I/O.
//
//   submitted -> ai_suggested -> ta_reviewed -> released
//
// The AI never releases a grade. A TA confirms or changes every suggestion. A submission is
// routed to faculty when any AI criterion has confidence < 0.6, the AI raised flags, or the TA
// and AI differ by 2+ points on any criterion. Final-project items always need faculty sign-off.
// Routed submissions stay in ta_reviewed until faculty sign off; others release on TA review.

export const STATUSES = Object.freeze(['submitted', 'ai_suggested', 'ta_reviewed', 'released']);
export const LOW_CONFIDENCE = 0.6;
export const GAP_POINTS = 2;
export const AI_NOTE = 'An AI model suggested a first-pass score. A member of the teaching team reviewed and confirmed this grade.';

export class GradingError extends Error {
  constructor(message, code = 'invalid_transition') {
    super(message);
    this.code = code;
  }
}

function assertStatus(sub, allowed, action) {
  if (!allowed.includes(sub.status)) {
    throw new GradingError(`Cannot ${action} a submission in status "${sub.status}" (needs ${allowed.join(' or ')}).`);
  }
}

export function createSubmission({ id, student, activity, submittedAt, text, final = false }) {
  return { id, student, activity, submittedAt, text, final, status: 'submitted', ai: null, ta: null, faculty: null, routing: null };
}

/** Attach an AI suggestion. Allowed from submitted, or to refresh a suggestion before TA review. */
export function applySuggestion(sub, ai) {
  assertStatus(sub, ['submitted', 'ai_suggested'], 'attach an AI suggestion to');
  return { ...sub, ai, status: 'ai_suggested', routing: routeToFaculty({ ...sub, ai }) };
}

/** Why a submission needs faculty. Returns { toFaculty, reasons[] }. */
export function routeToFaculty(sub) {
  const reasons = [];
  const ai = sub.ai || {};
  const aiCriteria = ai.criteria || [];
  for (const c of aiCriteria) {
    if (typeof c.confidence === 'number' && c.confidence < LOW_CONFIDENCE) {
      reasons.push({ code: 'low-confidence', criterion: c.id, text: `AI confidence on ${c.id} is ${c.confidence} (below ${LOW_CONFIDENCE}).` });
    }
  }
  for (const f of ai.flags || []) reasons.push({ code: 'flag', flag: f, text: `AI raised the flag "${f}".` });
  if (sub.ta && Array.isArray(sub.ta.criteria)) {
    for (const t of sub.ta.criteria) {
      const a = aiCriteria.find((x) => x.id === t.id);
      if (a && Math.abs(t.score - a.score) >= GAP_POINTS) {
        reasons.push({ code: 'ta-ai-gap', criterion: t.id, text: `TA (${t.score}) and AI (${a.score}) differ by ${Math.abs(t.score - a.score)} points on ${t.id}.` });
      }
    }
  }
  if (sub.final) reasons.push({ code: 'final', text: 'Final project grades need faculty sign-off.' });
  return { toFaculty: reasons.length > 0, reasons };
}

/**
 * Record the TA decision. The TA must score every criterion the AI scored.
 * Moves to ta_reviewed, and on to released when nothing routes it to faculty.
 */
export function applyTaReview(sub, { by, criteria, comment = '', at }) {
  assertStatus(sub, ['ai_suggested'], 'record a TA review on');
  if (!by) throw new GradingError('A TA review needs a reviewer id.', 'invalid_review');
  const needed = (sub.ai && sub.ai.criteria ? sub.ai.criteria : []).map((c) => c.id);
  const given = new Set((criteria || []).map((c) => c.id));
  const missing = needed.filter((id) => !given.has(id));
  if (missing.length) throw new GradingError(`TA review is missing criteria: ${missing.join(', ')}.`, 'invalid_review');
  const reviewed = { ...sub, ta: { by, criteria, comment, at }, status: 'ta_reviewed' };
  const routing = routeToFaculty(reviewed);
  reviewed.routing = routing;
  if (!routing.toFaculty) return release(reviewed, { at });
  return reviewed;
}

/** Faculty sign-off, optionally overriding criteria. Releases the grade. */
export function applyFacultySignOff(sub, { by, criteria = null, comment = '', at }) {
  assertStatus(sub, ['ta_reviewed'], 'sign off');
  if (!by) throw new GradingError('Faculty sign-off needs a reviewer id.', 'invalid_review');
  const signed = { ...sub, faculty: { signedOff: true, by, at, comment, ...(criteria ? { criteria } : {}) } };
  return release(signed, { at });
}

function release(sub, { at }) {
  if (sub.routing && sub.routing.toFaculty && !(sub.faculty && sub.faculty.signedOff)) {
    throw new GradingError('This submission was routed to faculty and needs sign-off before release.', 'needs_faculty');
  }
  return { ...sub, status: 'released', releasedAt: at };
}

/** What a student sees: only human-confirmed scores, plus the AI-assist note. */
export function studentView(sub, rubric) {
  if (sub.status !== 'released') return { id: sub.id, activity: sub.activity, status: sub.status, released: false };
  const criteria = (sub.faculty && sub.faculty.criteria) || sub.ta.criteria;
  const max = rubric ? rubric.criteria.reduce((s, c) => s + c.max, 0) : null;
  return {
    id: sub.id,
    activity: sub.activity,
    status: 'released',
    released: true,
    criteria: criteria.map((c) => ({ id: c.id, score: c.score })),
    total: criteria.reduce((s, c) => s + c.score, 0),
    max,
    comment: [sub.ta && sub.ta.comment, sub.faculty && sub.faculty.comment].filter(Boolean).join('\n\n'),
    note: AI_NOTE,
  };
}

/**
 * Quadratic weighted kappa between two raters on an integer scale [min, max].
 * Returns 1 for perfect agreement, 0 for chance level, negative for worse than chance.
 * Returns null when there are no pairs or both raters used one identical value only.
 */
export function quadraticWeightedKappa(a, b, min, max) {
  if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) {
    throw new Error('Ratings must be two arrays of the same length.');
  }
  if (a.length === 0) return null;
  if (min === undefined) min = Math.min(...a, ...b);
  if (max === undefined) max = Math.max(...a, ...b);
  const k = max - min + 1;
  if (k <= 1) return null;
  const O = Array.from({ length: k }, () => new Array(k).fill(0));
  const ha = new Array(k).fill(0);
  const hb = new Array(k).fill(0);
  for (let i = 0; i < a.length; i += 1) {
    const x = Math.round(a[i]) - min;
    const y = Math.round(b[i]) - min;
    if (x < 0 || x >= k || y < 0 || y >= k) throw new Error('Rating out of range.');
    O[x][y] += 1;
    ha[x] += 1;
    hb[y] += 1;
  }
  const n = a.length;
  let num = 0;
  let den = 0;
  for (let i = 0; i < k; i += 1) {
    for (let j = 0; j < k; j += 1) {
      const w = ((i - j) * (i - j)) / ((k - 1) * (k - 1));
      const e = (ha[i] * hb[j]) / n;
      num += w * O[i][j];
      den += w * e;
    }
  }
  if (den === 0) return num === 0 ? 1 : null;
  return 1 - num / den;
}

/**
 * Calibration across reviewed submissions: AI vs human (faculty override, else TA) per criterion.
 * Scores are compared on each criterion's own 0..max scale.
 */
export function calibration(submissions, getRubric) {
  const ai = [];
  const human = [];
  let max = 0;
  for (const s of submissions || []) {
    if (!s.ai || !s.ta) continue;
    const humanCriteria = (s.faculty && s.faculty.criteria) || s.ta.criteria;
    for (const h of humanCriteria) {
      const x = s.ai.criteria.find((c) => c.id === h.id);
      if (!x) continue;
      ai.push(x.score);
      human.push(h.score);
      const rubric = getRubric ? getRubric(s) : null;
      const rc = rubric ? rubric.criteria.find((c) => c.id === h.id) : null;
      max = Math.max(max, rc ? rc.max : x.max || 5);
    }
  }
  const pairs = ai.length;
  const exact = pairs ? ai.filter((v, i) => v === human[i]).length / pairs : null;
  const within1 = pairs ? ai.filter((v, i) => Math.abs(v - human[i]) <= 1).length / pairs : null;
  return { pairs, qwk: pairs ? quadraticWeightedKappa(ai, human, 0, max || 5) : null, exactAgreement: exact, withinOne: within1 };
}
