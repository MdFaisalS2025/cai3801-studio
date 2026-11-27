// The same document-store contract on every backend we ship: memory, SQLite (node:sqlite), libSQL/Turso (local file).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createMemoryDocStore, createSqliteDocStore, createLibsqlDocStore } from '../classroom/store.js';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cls-store-'));
const makers = {
  memory: async () => createMemoryDocStore(),
  sqlite: async () => createSqliteDocStore(path.join(dir, 'a.db')),
  libsql: async () => createLibsqlDocStore({ CLASS_DB: path.join(dir, 'b.db') }),
};

for (const [name, make] of Object.entries(makers)) {
  test(`${name}: get, put, find, newest, del`, async () => {
    const s = await make();
    assert.equal(await s.get('users', 'u1'), null);
    await s.put('users', 'u1', { classId: 'c1', email: 'a@x.edu', role: 'student' });
    await s.put('users', 'u2', { classId: 'c1', email: 'b@x.edu', role: 'ta' });
    await s.put('users', 'u3', { classId: 'c2', email: 'c@x.edu', role: 'student' });
    assert.equal((await s.get('users', 'u1')).email, 'a@x.edu');
    assert.equal((await s.find('users', { classId: 'c1' })).length, 2);
    assert.deepEqual((await s.find('users', { classId: 'c1', role: 'ta' })).map((u) => u.id), ['u2']);
    assert.equal((await s.find('users', { email: 'c@x.edu' }))[0].id, 'u3');
    await s.put('users', 'u1', { classId: 'c1', email: 'a2@x.edu', role: 'student' });
    assert.equal((await s.get('users', 'u1')).email, 'a2@x.edu', 'put replaces');
    for (let i = 0; i < 5; i++) await s.put('prompts', 'p' + i, { classId: 'c1', userId: 'u1', n: i, ts: `2026-11-0${i + 1}` });
    assert.deepEqual((await s.find('prompts', { classId: 'c1' }, { newest: 2 })).map((p) => p.n), [3, 4]);
    assert.equal((await s.find('prompts', { userId: 'u1' })).length, 5);
    await s.del('users', 'u3');
    assert.equal(await s.get('users', 'u3'), null);
    await s.close();
  });
}
