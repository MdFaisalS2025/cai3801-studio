// Application service shared by the HTTP API and the MCP server. It wires the pure rules in
// shared/ to a store, an LLM provider, a clock and an event sink. No HTTP here.

import { randomUUID } from 'node:crypto';
import { COMPETENCIES, COMPETENCY_IDS, levelBand } from '../shared/competencies.js';
import { LESSONS, calendar, getActivity, getRubric, lessonForActivity, weekForDate } from '../shared/lessons.js';
import { READINGS, getReading } from '../shared/readings.js';
import { collectEvidence, computeLevels, levelDrops } from '../shared/competencyScore.js';
import { recommend, atRisk } from '../shared/recommend.js';
import { gamifySummary } from '../shared/gamify.js';
import { applySuggestion, applyTaReview, applyFacultySignOff, studentView, calibration, createSubmission, GradingError } from '../shared/grading.js';
import { suggestScores } from '../llm/gradeSuggest.js';
import { tutor } from '../llm/tutor.js';

const DAY = 24 * 60 * 60 * 1000;
export const VERBS = Object.freeze(['viewed', 'started', 'completed', 'submitted', 'asked', 'graded']);

export class ServiceError extends Error {
  constructor(status, code, message) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

const notFound = (what, id) => new ServiceError(404, 'not_found', `${what} "${id}" not found.`);

export function createService({ store, llm, sink = { write: async () => {} }, clock = () => new Date(), termStart }) {
  if (!termStart) throw new Error('createService needs a termStart (ISO date).');
  const nowIso = () => clock().toISOString();
  const currentWeek = () => weekForDate(nowIso(), termStart);
  const cal = calendar(termStart);

  async function requireStudent(id) {
    const s = await store.getStudent(id);
    if (!s) throw notFound('Student', id);
    return s;
  }

  async function studentState(id) {
    const [events, submissions] = await Promise.all([store.listEvents({ actor: id }), store.listSubmissions({ student: id })]);
    const evidence = collectEvidence({ events, submissions });
    const now = nowIso();
    const levels = computeLevels(evidence, { asOf: now });
    return { events, submissions, evidence, levels, now };
  }

  const service = {
    termStart,
    now: nowIso,
    currentWeek,

    listLessons() {
      return LESSONS;
    },

    getRubric(id) {
      const r = getRubric(id);
      if (!r) throw notFound('Rubric', id);
      return r;
    },

    async recordEvent(input) {
      const activity = getActivity(input.object);
      const evt = {
        id: `evt_${randomUUID()}`,
        actor: input.actor,
        verb: input.verb,
        object: input.object,
        week: input.week ?? (activity ? lessonForActivity(input.object).week : weekForDate(input.ts || nowIso(), termStart)),
        ts: input.ts || nowIso(),
        ...(input.result ? { result: input.result } : {}),
      };
      await store.addEvent(evt);
      await sink.write(evt);
      let submission = null;
      // A "submitted" event with text on a rubric activity opens a submission for grading.
      if (evt.verb === 'submitted' && activity && activity.rubric && typeof input.text === 'string' && input.text.trim()) {
        submission = createSubmission({
          id: `sub_${evt.actor}_${evt.object}`,
          student: evt.actor,
          activity: evt.object,
          submittedAt: evt.ts,
          text: input.text,
          final: Boolean(activity.final),
        });
        const existing = await store.getSubmission(submission.id);
        if (existing && existing.status !== 'submitted') {
          throw new ServiceError(409, 'already_graded', `Submission ${submission.id} is already ${existing.status}.`);
        }
        await store.saveSubmission(submission);
      }
      return { event: evt, submission: submission ? { id: submission.id, status: submission.status } : null };
    },

    async progress(studentId) {
      const student = await requireStudent(studentId);
      const { events, submissions, levels, now } = await studentState(studentId);
      const week = currentWeek();
      const grades = submissions.map((s) => studentView(s, getRubric((getActivity(s.activity) || {}).rubric)));
      return {
        student,
        asOf: now,
        week,
        competencies: COMPETENCIES.map((c) => ({ id: c.id, name: c.name, ...levels[c.id] })),
        gamification: gamifySummary({ events, levels, currentWeek: week }),
        grades,
        recentEvents: events.slice(-10).reverse(),
      };
    },

    async recommendations(studentId) {
      await requireStudent(studentId);
      const { events, levels, now } = await studentState(studentId);
      const nowMs = Date.parse(now);
      const upcoming = cal.filter((c) => Date.parse(c.dueAt) >= nowMs && Date.parse(c.dueAt) <= nowMs + 14 * DAY);
      const { recommendations } = recommend({ now, events, levels, upcoming, currentWeek: currentWeek() });
      return { student: studentId, asOf: now, recommendations };
    },

    async askTutor({ studentId, question, readingIds, readings, activityId }) {
      let docs = readings && readings.length ? readings : null;
      if (!docs && readingIds && readingIds.length) {
        docs = readingIds.map((id) => getReading(id)).filter(Boolean);
        if (!docs.length) throw new ServiceError(400, 'bad_request', 'None of the readingIds exist.');
      }
      if (!docs && activityId) {
        const lesson = lessonForActivity(activityId);
        if (!lesson) throw notFound('Activity', activityId);
        docs = lesson.activities.filter((a) => a.reading).map((a) => getReading(a.reading));
      }
      if (!docs) {
        const lesson = LESSONS.find((l) => l.week === currentWeek());
        docs = lesson.activities.filter((a) => a.reading).map((a) => getReading(a.reading));
      }
      const labs = LESSONS.flatMap((l) => l.activities.filter((a) => a.rubric));
      const result = await tutor({ provider: llm, question, readings: docs, labs });
      if (studentId) {
        // Log the question against the reading activity so rule R4 can see tutor loops.
        const first = result.citations[0] || docs[0];
        const readingActivity = LESSONS.flatMap((l) => l.activities).find((a) => first && a.reading === first.id);
        if (readingActivity) await service.recordEvent({ actor: studentId, verb: 'asked', object: readingActivity.id });
      }
      return result;
    },

    async suggest(submissionId) {
      const sub = await store.getSubmission(submissionId);
      if (!sub) throw notFound('Submission', submissionId);
      const activity = getActivity(sub.activity);
      const rubric = activity && getRubric(activity.rubric);
      if (!rubric) throw new ServiceError(400, 'no_rubric', `Activity ${sub.activity} has no rubric.`);
      const ai = await suggestScores({ provider: llm, rubric, text: sub.text, now: nowIso() });
      const updated = applySuggestion(sub, ai);
      await store.saveSubmission(updated);
      return updated;
    },

    async review(submissionId, { role, by, criteria, comment }) {
      const sub = await store.getSubmission(submissionId);
      if (!sub) throw notFound('Submission', submissionId);
      const activity = getActivity(sub.activity);
      const rubric = getRubric(activity.rubric);
      for (const c of criteria || []) {
        const rc = rubric.criteria.find((r) => r.id === c.id);
        if (!rc) throw new ServiceError(400, 'bad_request', `Unknown criterion ${c.id} for ${rubric.id}.`);
        if (!Number.isInteger(c.score) || c.score < 0 || c.score > rc.max) {
          throw new ServiceError(400, 'bad_request', `Score for ${c.id} must be an integer 0..${rc.max}.`);
        }
      }
      const at = nowIso();
      let updated;
      if (role === 'faculty' && sub.status === 'ta_reviewed') {
        updated = applyFacultySignOff(sub, { by, criteria: criteria && criteria.length ? criteria : null, comment, at });
      } else {
        // TAs (or faculty acting as first reviewer) confirm or change every AI suggestion.
        updated = applyTaReview(sub, { by, criteria, comment, at });
      }
      await store.saveSubmission(updated);
      if (updated.status === 'released') {
        const final = (updated.faculty && updated.faculty.criteria) || updated.ta.criteria;
        const total = final.reduce((s, c) => s + c.score, 0);
        const max = rubric.criteria.reduce((s, c) => s + c.max, 0);
        await service.recordEvent({ actor: updated.student, verb: 'graded', object: updated.activity, result: { score: Number((total / max).toFixed(2)) } });
      }
      return updated;
    },

    async classOverview() {
      const students = await store.listStudents();
      const now = nowIso();
      const sums = Object.fromEntries(COMPETENCY_IDS.map((c) => [c, { total: 0, n: 0 }]));
      const flagged = [];
      for (const s of students) {
        const [events, submissions] = await Promise.all([store.listEvents({ actor: s.id }), store.listSubmissions({ student: s.id })]);
        const evidence = collectEvidence({ events, submissions });
        const levels = computeLevels(evidence, { asOf: now });
        for (const c of COMPETENCY_IDS) {
          if (levels[c].level !== null) {
            sums[c].total += levels[c].level;
            sums[c].n += 1;
          }
        }
        const risk = atRisk({ now, events, calendar: cal, drops: levelDrops(evidence, now) });
        if (risk.atRisk) flagged.push({ student: s.id, name: s.name, reasons: risk.reasons });
      }
      const allSubs = await store.listSubmissions({});
      const queue = { submitted: 0, ai_suggested: 0, ta_reviewed: 0, released: 0 };
      for (const s of allSubs) queue[s.status] = (queue[s.status] || 0) + 1;
      const facultyQueue = allSubs
        .filter((s) => s.status === 'ta_reviewed' && s.routing && s.routing.toFaculty)
        .map((s) => ({ id: s.id, student: s.student, activity: s.activity, reasons: s.routing.reasons }));
      return {
        asOf: now,
        week: currentWeek(),
        students: students.length,
        competencyAverages: COMPETENCIES.map((c) => {
          const avg = sums[c.id].n ? Math.round(sums[c.id].total / sums[c.id].n) : null;
          return { id: c.id, name: c.name, average: avg, band: avg === null ? null : levelBand(avg).name, studentsWithEvidence: sums[c.id].n };
        }),
        atRisk: flagged,
        atRiskNote: 'Flags inform a person. They never act on a student automatically.',
        gradingQueue: queue,
        facultyQueue,
        calibration: calibration(allSubs, (s) => getRubric((getActivity(s.activity) || {}).rubric)),
      };
    },

    listReadings() {
      return READINGS;
    },
  };
  return service;
}

export { GradingError };
