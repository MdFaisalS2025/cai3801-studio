// In-memory store, seeded with deterministic demo data. Used for local runs, tests and the
// offline demo. Data is lost on restart. Every method is async to match the Firestore store.

import { generateDemoData } from './seed.js';

const clone = (v) => (v === undefined ? v : structuredClone(v));

export function createMemoryStore({ seed = true, termStart, now } = {}) {
  const data = seed ? generateDemoData({ ...(termStart ? { termStart } : {}), ...(now ? { now } : {}) }) : { students: [], events: [], submissions: [] };
  const students = new Map(data.students.map((s) => [s.id, s]));
  const events = [...data.events];
  const submissions = new Map(data.submissions.map((s) => [s.id, s]));

  return {
    kind: 'memory',
    async listStudents() {
      return [...students.values()].map(clone);
    },
    async getStudent(id) {
      return clone(students.get(id)) || null;
    },
    async upsertStudent(student) {
      students.set(student.id, clone(student));
      return clone(student);
    },
    async addEvent(evt) {
      events.push(clone(evt));
      return clone(evt);
    },
    /** Events filtered by actor and time range (ISO strings), oldest first. */
    async listEvents({ actor, since, until } = {}) {
      const from = since ? Date.parse(since) : -Infinity;
      const to = until ? Date.parse(until) : Infinity;
      return events
        .filter((e) => (!actor || e.actor === actor) && Date.parse(e.ts) >= from && Date.parse(e.ts) <= to)
        .sort((a, b) => Date.parse(a.ts) - Date.parse(b.ts))
        .map(clone);
    },
    async getSubmission(id) {
      return clone(submissions.get(id)) || null;
    },
    async saveSubmission(sub) {
      submissions.set(sub.id, clone(sub));
      return clone(sub);
    },
    async listSubmissions({ student, status, activity } = {}) {
      return [...submissions.values()]
        .filter((s) => (!student || s.student === student) && (!status || s.status === status) && (!activity || s.activity === activity))
        .map(clone);
    },
  };
}
