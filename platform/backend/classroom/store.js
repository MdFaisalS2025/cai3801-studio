// Document store for the classroom server. Three backends with one small interface:
//
//   get(coll, id) -> doc | null        put(coll, id, doc) -> doc       del(coll, id)
//   find(coll, where = {}, { newest }) -> [doc]   equality on top-level fields; newest=N keeps
//                                     only the N most recently written docs (cheap on SQL stores)
//
// CLASS_STORE=sqlite (default, a single file, good for one server or a small VM)
// CLASS_STORE=libsql (Turso: hosted SQLite with a free tier; use with Cloud Run, which is stateless)
// CLASS_STORE=firestore (works, but its free read quota is too small for a 600-student class)
// CLASS_STORE=memory (tests)
//
// Every doc that belongs to a class carries classId, and user-owned docs carry userId, so the
// SQLite backend can index both and Firestore can query them directly.

import path from 'node:path';
import fs from 'node:fs';

function matches(doc, where) {
  for (const [k, v] of Object.entries(where)) if (doc[k] !== v) return false;
  return true;
}

export function createMemoryDocStore() {
  const colls = new Map();
  const c = (name) => { if (!colls.has(name)) colls.set(name, new Map()); return colls.get(name); };
  const clone = (x) => (x == null ? null : structuredClone(x));
  return {
    kind: 'memory',
    async get(coll, id) { return clone(c(coll).get(id)); },
    async put(coll, id, doc) { c(coll).set(id, clone({ ...doc, id })); return { ...doc, id }; },
    async del(coll, id) { c(coll).delete(id); },
    async find(coll, where = {}, opts = {}) { let a = [...c(coll).values()].filter((d) => matches(d, where)); if (opts.newest) a = a.slice(-opts.newest); return a.map(clone); },
    async close() {},
  };
}

const SCHEMA = [
  'CREATE TABLE IF NOT EXISTS docs (coll TEXT NOT NULL, id TEXT NOT NULL, class_id TEXT, user_id TEXT, data TEXT NOT NULL, PRIMARY KEY (coll, id))',
  'CREATE INDEX IF NOT EXISTS docs_class ON docs (coll, class_id)',
  'CREATE INDEX IF NOT EXISTS docs_user ON docs (coll, user_id)',
];
const SQL = {
  get: 'SELECT data FROM docs WHERE coll = ? AND id = ?',
  put: 'INSERT INTO docs (coll, id, class_id, user_id, data) VALUES (?, ?, ?, ?, ?) ON CONFLICT (coll, id) DO UPDATE SET class_id = excluded.class_id, user_id = excluded.user_id, data = excluded.data',
  del: 'DELETE FROM docs WHERE coll = ? AND id = ?',
};
function selectFor(coll, where, opts) {
  let sql = 'SELECT data FROM docs WHERE coll = ?'; const args = [coll];
  if (where.userId) { sql += ' AND user_id = ?'; args.push(where.userId); }
  else if (where.classId) { sql += ' AND class_id = ?'; args.push(where.classId); }
  if (opts.newest) { sql += ' ORDER BY rowid DESC LIMIT ?'; args.push(opts.newest); }
  return { sql, args };
}
function finish(rows, where, opts) {
  let out = rows.map((r) => JSON.parse(r.data)).filter((d) => matches(d, where));
  if (opts.newest) out = out.reverse();
  return out;
}

export async function createSqliteDocStore(file) {
  const { DatabaseSync } = await import('node:sqlite');
  if (file !== ':memory:') fs.mkdirSync(path.dirname(path.resolve(file)), { recursive: true });
  const db = new DatabaseSync(file);
  db.exec('PRAGMA journal_mode=WAL; PRAGMA busy_timeout=4000;');
  for (const q of SCHEMA) db.exec(q);
  const qGet = db.prepare(SQL.get), qPut = db.prepare(SQL.put), qDel = db.prepare(SQL.del);
  return {
    kind: 'sqlite',
    async get(coll, id) { const r = qGet.get(coll, id); return r ? JSON.parse(r.data) : null; },
    async put(coll, id, doc) { const d = { ...doc, id }; qPut.run(coll, id, d.classId ?? null, d.userId ?? null, JSON.stringify(d)); return d; },
    async del(coll, id) { qDel.run(coll, id); },
    async find(coll, where = {}, opts = {}) { const { sql, args } = selectFor(coll, where, opts); return finish(db.prepare(sql).all(...args), where, opts); },
    async close() { db.close(); },
  };
}

/** Turso / libSQL: the same table over the network (or a local file for testing). */
export async function createLibsqlDocStore(env) {
  const { createClient } = await import('@libsql/client');
  const url = env.TURSO_DATABASE_URL || `file:${env.CLASS_DB || path.join(process.cwd(), 'data', 'classroom-libsql.db')}`;
  if (url.startsWith('file:')) fs.mkdirSync(path.dirname(path.resolve(url.slice(5))), { recursive: true });
  const db = createClient({ url, authToken: env.TURSO_AUTH_TOKEN });
  for (const q of SCHEMA) await db.execute(q);
  return {
    kind: 'libsql',
    async get(coll, id) { const r = await db.execute({ sql: SQL.get, args: [coll, id] }); return r.rows[0] ? JSON.parse(r.rows[0].data) : null; },
    async put(coll, id, doc) { const d = { ...doc, id }; await db.execute({ sql: SQL.put, args: [coll, id, d.classId ?? null, d.userId ?? null, JSON.stringify(d)] }); return d; },
    async del(coll, id) { await db.execute({ sql: SQL.del, args: [coll, id] }); },
    async find(coll, where = {}, opts = {}) { const r = await db.execute(selectFor(coll, where, opts)); return finish(r.rows, where, opts); },
    async close() { db.close(); },
  };
}

export async function createFirestoreDocStore(env) {
  const { Firestore } = await import('@google-cloud/firestore');
  const fsdb = new Firestore({ projectId: env.GOOGLE_CLOUD_PROJECT, databaseId: env.FIRESTORE_DATABASE || '(default)' });
  const prefix = env.FIRESTORE_PREFIX || 'cls_';
  const col = (c) => fsdb.collection(prefix + c);
  return {
    kind: 'firestore',
    async get(coll, id) { const s = await col(coll).doc(id).get(); return s.exists ? s.data() : null; },
    async put(coll, id, doc) { const d = JSON.parse(JSON.stringify({ ...doc, id })); await col(coll).doc(id).set(d); return d; },
    async del(coll, id) { await col(coll).doc(id).delete(); },
    async find(coll, where = {}, opts = {}) {
      let q = col(coll);
      for (const [k, v] of Object.entries(where)) q = q.where(k, '==', v);
      const snap = await q.get();
      const all = snap.docs.map((d) => d.data());
      return opts.newest ? all.sort((a, b) => String(a.ts || '').localeCompare(String(b.ts || ''))).slice(-opts.newest) : all;
    },
    async close() {},
  };
}

export async function createDocStore(env = process.env) {
  const kind = env.CLASS_STORE || 'sqlite';
  if (kind === 'memory') return createMemoryDocStore();
  if (kind === 'sqlite') return createSqliteDocStore(env.CLASS_DB || path.join(process.cwd(), 'data', 'classroom.db'));
  if (kind === 'libsql') return createLibsqlDocStore(env);
  if (kind === 'firestore') return createFirestoreDocStore(env);
  throw new Error(`Unknown CLASS_STORE "${kind}". Use sqlite, libsql, firestore or memory.`);
}
