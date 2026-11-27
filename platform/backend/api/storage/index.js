// Storage selection. STORAGE=memory (default) or STORAGE=firestore.
//
// Store interface (all async):
//   listStudents() getStudent(id) upsertStudent(student)
//   addEvent(evt) listEvents({ actor, since, until })
//   getSubmission(id) saveSubmission(sub) listSubmissions({ student, status, activity })

import { createMemoryStore } from './memory.js';

export async function createStore(env = process.env, opts = {}) {
  const kind = env.STORAGE || 'memory';
  if (kind === 'memory') return createMemoryStore(opts);
  if (kind === 'firestore') {
    const { createFirestoreStore } = await import('./firestore.js');
    return createFirestoreStore(env);
  }
  throw new Error(`Unknown STORAGE "${kind}". Use memory or firestore.`);
}

export { createMemoryStore };
