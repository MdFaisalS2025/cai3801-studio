// Firestore (native mode) store. Loaded only when STORAGE=firestore.
// Collections: students/{id}, events/{id}, submissions/{id}.
// The events query by actor + ts needs the composite index defined in infra/terraform.
//
// Env: GOOGLE_CLOUD_PROJECT (optional on Cloud Run), FIRESTORE_DATABASE (default "(default)")
// Not exercised by tests; verify against a real project or the Firestore emulator
// (set FIRESTORE_EMULATOR_HOST) before relying on it.

export async function createFirestoreStore(env = process.env) {
  const { Firestore } = await import('@google-cloud/firestore');
  const db = new Firestore({
    ...(env.GOOGLE_CLOUD_PROJECT ? { projectId: env.GOOGLE_CLOUD_PROJECT } : {}),
    ...(env.FIRESTORE_DATABASE ? { databaseId: env.FIRESTORE_DATABASE } : {}),
    ignoreUndefinedProperties: true,
  });
  const col = (name) => db.collection(name);
  const docs = (snap) => snap.docs.map((d) => d.data());

  return {
    kind: 'firestore',
    async listStudents() {
      return docs(await col('students').get());
    },
    async getStudent(id) {
      const d = await col('students').doc(id).get();
      return d.exists ? d.data() : null;
    },
    async upsertStudent(student) {
      await col('students').doc(student.id).set(student, { merge: true });
      return student;
    },
    async addEvent(evt) {
      await col('events').doc(evt.id).set(evt);
      return evt;
    },
    async listEvents({ actor, since, until } = {}) {
      let q = col('events');
      if (actor) q = q.where('actor', '==', actor);
      if (since) q = q.where('ts', '>=', since);
      if (until) q = q.where('ts', '<=', until);
      return docs(await q.orderBy('ts').get());
    },
    async getSubmission(id) {
      const d = await col('submissions').doc(id).get();
      return d.exists ? d.data() : null;
    },
    async saveSubmission(sub) {
      await col('submissions').doc(sub.id).set(sub);
      return sub;
    },
    async listSubmissions({ student, status, activity } = {}) {
      let q = col('submissions');
      if (student) q = q.where('student', '==', student);
      if (status) q = q.where('status', '==', status);
      if (activity) q = q.where('activity', '==', activity);
      return docs(await q.get());
    },
  };
}
