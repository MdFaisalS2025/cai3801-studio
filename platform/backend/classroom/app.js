// Classroom server: real accounts for one course run outside Canvas and USF sign-in.
//
// Who can do what
//   faculty  creates the class at first run, shares the join code, invites TAs, sees and manages
//            everything in the class, exports grades as CSV.
//   ta       sees the roster, grades submissions, makes password-reset links for students.
//   student  joins with the class code and their own email and password; sees only their own data.
//
// Pages
//   GET /            the Studio, with this user's data injected (or a redirect to /login)
//   GET /login, /join/:code, /reset/:token, /invite/:token, /setup   the sign-in page
//   everything else in SITE_DIR is static (lab, companion, blueprint)
//
// API (all under /api/c, JSON). State-changing calls need the header x-cai-csrf: 1.

import express from 'express';
import fs from 'node:fs';
import zlib from 'node:zlib';
import path from 'node:path';
import {
  hashPassword, verifyPassword, passwordProblem, newToken, sha256, newId, newJoinCode, normCode,
  normEmail, validEmail, parseCookies, sessionCookie, rateLimiter,
} from './security.js';
import { rubricFor, firstPassPrompt, cleanFirstPass, graderInjection } from './rubrics.js';

const COOKIE = 'cai_s';
const SESSION_DAYS = 14;
const DAY = 86400000;
const STATE_APPS = new Set(['studio', 'companion', 'lab']);
const MAX_STATE_BYTES = 900_000;
// A well-formed hash nobody's password matches, used when a sign-in names an unknown email.
const DUMMY_HASH = ['scrypt', 2 ** 15, 8, 3, newToken(16), newToken(32)].join('$');

export class HttpError extends Error {
  constructor(status, code, message) { super(message); this.status = status; this.code = code; }
}
const bad = (msg, code = 'bad_request') => new HttpError(400, code, msg);
const str = (v, max) => (typeof v === 'string' ? v.trim().slice(0, max) : '');

/** "001, 002 ,003" -> ['001','002','003'] (at most 40, each up to 12 characters). */
export function cleanSections(v) {
  const list = (Array.isArray(v) ? v : String(v || '').split(',')).map((x) => String(x).trim().slice(0, 12)).filter(Boolean);
  return list.length ? [...new Set(list)].slice(0, 40) : null;
}

export function weekOf(termStart, now = new Date()) {
  const t = new Date(termStart + 'T00:00:00');
  if (Number.isNaN(+t)) return 1;
  return Math.max(1, Math.min(14, Math.floor((+now - +t) / (7 * DAY)) + 1));
}

export function createClassroomApp({ store, llm, env = process.env, siteDir, logger = console, setupToken }) {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', env.TRUST_PROXY === 'off' ? false : 1);
  const secureCookies = env.COOKIE_SECURE ? env.COOKIE_SECURE === 'on' : false;
  const loginLimit = rateLimiter({ max: 8, windowMs: 15 * 60_000 });
  // Campus Wi-Fi puts hundreds of students behind one address, so per-network limits are generous.
  const joinLimit = rateLimiter({ max: 1000, windowMs: 60 * 60_000 });
  const today = () => new Date().toISOString().slice(0, 10);

  app.use((req, res, next) => {
    res.set({
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'same-origin',
      'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
      'Content-Security-Policy': "frame-ancestors 'self'; base-uri 'self'; form-action 'self'",
      'X-Robots-Tag': 'noindex, nofollow',
    });
    if (req.secure) res.set('Strict-Transport-Security', 'max-age=31536000');
    next();
  });
  app.use(express.json({ limit: '1mb' }));
  app.get('/healthz', (req, res) => res.json({ ok: true, store: store.kind, llm: llm?.id || 'none' }));
  app.get('/robots.txt', (req, res) => res.type('text').send('User-agent: *\nDisallow: /\n'));

  // ---------- sessions ----------
  async function startSession(res, req, user) {
    const token = newToken();
    await store.put('sessions', sha256(token), { userId: user.id, exp: Date.now() + SESSION_DAYS * DAY, ua: str(req.get('user-agent'), 120) });
    res.append('Set-Cookie', sessionCookie(COOKIE, token, { secure: secureCookies || req.secure, maxAgeSec: SESSION_DAYS * 86400 }));
  }
  async function whoIs(req) {
    const token = parseCookies(req.headers.cookie)[COOKIE];
    if (!token) return null;
    const s = await store.get('sessions', sha256(token));
    if (!s || s.exp < Date.now()) return null;
    const u = await store.get('users', s.userId);
    if (!u || u.disabled) return null;
    if (!u.lastSeen || Date.now() - Date.parse(u.lastSeen) > 10 * 60_000) { u.lastSeen = new Date().toISOString(); await store.put('users', u.id, u); }
    return u;
  }
  const publicUser = (u) => ({ id: u.id, name: u.name, email: u.email, role: u.role, classId: u.classId, section: u.section || null, sections: u.sections || [] });
  async function classOf(u) { return u.classId ? store.get('classes', u.classId) : null; }
  const publicClass = (c, staff) => c && ({
    id: c.id, name: c.name, term: c.term, termStart: c.termStart, now: weekOf(c.termStart),
    instructor: c.instructor, aiDailyLimit: c.aiDailyLimit, sections: c.sections && c.sections.length ? c.sections : ['001'],
    ...(staff ? { joinCode: c.joinCode, joinOpen: c.joinOpen } : {}),
  });

  // Expired sessions and one-time links are removed once an hour.
  async function sweep() {
    const now = Date.now();
    for (const coll of ['sessions', 'tokens']) for (const d of await store.find(coll)) if (d.exp < now - DAY) await store.del(coll, d.id);
  }
  if (env.NODE_ENV !== 'test') setInterval(() => sweep().catch((e) => logger.error('sweep', e?.message || e)), 3600_000).unref();
  app.locals.sweep = sweep;

  // ---------- API ----------
  const api = express.Router();
  api.use((req, res, next) => {
    if (req.method !== 'GET' && req.get('x-cai-csrf') !== '1') return next(new HttpError(403, 'csrf', 'Missing request header.'));
    const origin = req.get('origin');
    if (origin && req.method !== 'GET') {
      try { if (new URL(origin).host !== req.get('host')) return next(new HttpError(403, 'csrf', 'Cross-site request blocked.')); } catch { return next(new HttpError(403, 'csrf', 'Bad origin.')); }
    }
    res.set('Cache-Control', 'no-store');
    next();
  });
  const auth = (...roles) => async (req, res, next) => {
    const u = await whoIs(req);
    if (!u) return next(new HttpError(401, 'unauthenticated', 'Please sign in.'));
    if (roles.length && !roles.includes(u.role)) return next(new HttpError(403, 'forbidden', 'You do not have access to that.'));
    req.user = u;
    next();
  };
  const staff = auth('faculty', 'ta');
  const sameClass = async (req, uid) => {
    const s = await store.get('users', uid);
    if (!s || s.classId !== req.user.classId) throw new HttpError(404, 'not_found', 'No such student in your class.');
    return s;
  };

  // first run
  api.get('/setup', async (req, res) => {
    const users = await store.find('users');
    res.json({ needsSetup: users.length === 0 });
  });
  api.post('/setup', async (req, res) => {
    if ((await store.find('users')).length) throw new HttpError(409, 'done', 'Setup is already done. Sign in instead.');
    if (!setupToken || str(req.body.setupToken, 200) !== setupToken) throw new HttpError(403, 'bad_token', 'The setup code is wrong. It is printed in the server log when the server starts.');
    const email = normEmail(req.body.email), name = str(req.body.name, 80);
    if (!validEmail(email)) throw bad('Enter a valid email.');
    if (!name) throw bad('Enter your name.');
    const p = passwordProblem(req.body.password, email); if (p) throw bad(p);
    const cls = {
      id: newId('cls'), name: str(req.body.className, 120) || 'CAI 3801: AI & Analytics for Organizations',
      term: str(req.body.term, 40) || 'Fall 2026', termStart: /^\d{4}-\d{2}-\d{2}$/.test(req.body.termStart || '') ? req.body.termStart : '2026-08-24',
      instructor: name, joinCode: newJoinCode(), joinOpen: true, aiDailyLimit: 150, createdAt: new Date().toISOString(),
      sections: cleanSections(req.body.sections) || ['001'],
    };
    const u = { id: newId('usr'), email, name, role: 'faculty', classId: cls.id, pw: await hashPassword(req.body.password), createdAt: new Date().toISOString() };
    cls.ownerId = u.id; cls.classId = cls.id;
    await store.put('classes', cls.id, cls);
    await store.put('users', u.id, u);
    await startSession(res, req, u);
    res.status(201).json({ user: publicUser(u), class: publicClass(cls, true) });
  });

  api.post('/login', async (req, res) => {
    const email = normEmail(req.body.email);
    const key = `${req.ip}|${email}`;
    if (!loginLimit.hit(key)) throw new HttpError(429, 'slow_down', 'Too many tries. Wait 15 minutes, or ask your TA for a reset link.');
    const [u] = await store.find('users', { email });
    // Hash even when there is no such account, so response time doesn't reveal who has one.
    const ok = await verifyPassword(String(req.body.password || ''), u?.pw || DUMMY_HASH) && !!u && !u.disabled;
    if (!ok) throw new HttpError(401, 'bad_login', 'That email and password do not match.');
    loginLimit.reset(key);
    await startSession(res, req, u);
    res.json({ user: publicUser(u) });
  });
  api.post('/logout', async (req, res) => {
    const token = parseCookies(req.headers.cookie)[COOKIE];
    if (token) await store.del('sessions', sha256(token));
    res.append('Set-Cookie', sessionCookie(COOKIE, '', { secure: secureCookies || req.secure, maxAgeSec: 0 }));
    res.json({ ok: true });
  });
  api.get('/session', auth(), async (req, res) => {
    const c = await classOf(req.user);
    res.json({ user: publicUser(req.user), class: publicClass(c, req.user.role !== 'student') });
  });

  // join with a class code
  api.get('/join/:code', async (req, res) => {
    const [c] = await store.find('classes', { joinCode: normCode(req.params.code) });
    if (!c || !c.joinOpen) throw new HttpError(404, 'bad_code', 'That class code is not open. Check it with your instructor.');
    res.json({ className: c.name, term: c.term, instructor: c.instructor, sections: c.sections && c.sections.length ? c.sections : ['001'] });
  });
  api.post('/join', async (req, res) => {
    if (!joinLimit.hit(req.ip)) throw new HttpError(429, 'slow_down', 'Too many sign-ups from this network. Try again later.');
    const [c] = await store.find('classes', { joinCode: normCode(req.body.code) });
    if (!c || !c.joinOpen) throw new HttpError(404, 'bad_code', 'That class code is not open. Check it with your instructor.');
    const email = normEmail(req.body.email), name = str(req.body.name, 80);
    if (!validEmail(email)) throw bad('Enter a valid email.');
    if (name.length < 2) throw bad('Enter your name as your instructor knows it.');
    const p = passwordProblem(req.body.password, email); if (p) throw bad(p);
    if (!req.body.consent) throw bad('Please confirm you have read how your data is used.');
    if ((await store.find('users', { email })).length) throw new HttpError(409, 'exists', 'That email already has an account. Sign in, or ask your TA for a reset link.');
    const secs = c.sections && c.sections.length ? c.sections : ['001'];
    const section = secs.includes(String(req.body.section || '')) ? String(req.body.section) : (secs.length === 1 ? secs[0] : null);
    if (!section) throw bad('Choose your section.');
    const u = { id: newId('usr'), email, name, role: 'student', classId: c.id, section, pw: await hashPassword(req.body.password), createdAt: new Date().toISOString(), consentAt: req.body.consent ? new Date().toISOString() : null };
    if (!u.consentAt) throw bad('Please confirm you have read how your data is used.');
    await store.put('users', u.id, u);
    dropSnap(c.id);
    await startSession(res, req, u);
    res.status(201).json({ user: publicUser(u) });
  });

  // one-time links: password reset (any user) and TA invite
  api.get('/token/:t', async (req, res) => {
    const t = await store.get('tokens', sha256(req.params.t));
    if (!t || t.used || t.exp < Date.now()) throw new HttpError(404, 'bad_token', 'This link has expired or was already used. Ask for a new one.');
    const u = t.userId ? await store.get('users', t.userId) : null;
    const c = await store.get('classes', t.classId);
    res.json({ kind: t.kind, email: u?.email || null, name: u?.name || null, className: c?.name || '' });
  });
  api.post('/token/:t', async (req, res) => {
    const id = sha256(req.params.t);
    const t = await store.get('tokens', id);
    if (!t || t.used || t.exp < Date.now()) throw new HttpError(404, 'bad_token', 'This link has expired or was already used. Ask for a new one.');
    let u;
    if (t.kind === 'reset') {
      u = await store.get('users', t.userId);
      if (!u || u.disabled) throw new HttpError(404, 'bad_token', 'This account is no longer active.');
      const p = passwordProblem(req.body.password, u.email); if (p) throw bad(p);
      u.pw = await hashPassword(req.body.password);
      await store.put('users', u.id, u);
      for (const s of await store.find('sessions', { userId: u.id })) await store.del('sessions', s.id);
    } else if (t.kind === 'ta-invite') {
      const email = normEmail(req.body.email), name = str(req.body.name, 80);
      if (!validEmail(email)) throw bad('Enter a valid email.');
      if (name.length < 2) throw bad('Enter your name.');
      const p = passwordProblem(req.body.password, email); if (p) throw bad(p);
      if ((await store.find('users', { email })).length) throw new HttpError(409, 'exists', 'That email already has an account.');
      u = { id: newId('usr'), email, name, role: 'ta', classId: t.classId, sections: [], pw: await hashPassword(req.body.password), createdAt: new Date().toISOString() };
      await store.put('users', u.id, u);
    } else throw bad('Unknown link.');
    t.used = new Date().toISOString();
    await store.put('tokens', id, t);
    await startSession(res, req, u);
    res.json({ user: publicUser(u) });
  });
  async function makeLink(req, kind, extra, hours) {
    const token = newToken(24);
    await store.put('tokens', sha256(token), { kind, classId: req.user.classId, by: req.user.id, exp: Date.now() + hours * 3600_000, ...extra });
    const base = env.PUBLIC_URL || `${req.protocol}://${req.get('host')}`;
    return `${base.replace(/\/+$/, '')}/${kind === 'reset' ? 'reset' : 'invite'}/${token}`;
  }

  const resetLimit = rateLimiter({ max: 200, windowMs: 60 * 60_000 });
  const resetPerEmail = rateLimiter({ max: 3, windowMs: 60 * 60_000 });
  api.post('/reset-request', async (req, res) => {
    const email = normEmail(req.body.email);
    if (!resetLimit.hit(req.ip) || !resetPerEmail.hit(email)) throw new HttpError(429, 'slow_down', 'Too many requests. Try again later.');
    const [u] = validEmail(email) ? await store.find('users', { email }) : [];
    if (u && !u.disabled) {
      await store.put('resetreq', u.id, { userId: u.id, classId: u.classId, name: u.name, email: u.email, section: u.section || null, role: u.role, at: new Date().toISOString(), note: str(req.body.note, 200) });
      dropSnap(u.classId);
    }
    // Same answer either way, so this can't be used to find out who has an account.
    res.json({ ok: true });
  });

  api.post('/me/password', auth(), async (req, res) => {
    if (!await verifyPassword(String(req.body.current || ''), req.user.pw)) throw new HttpError(400, 'bad_password', 'Your current password is wrong.');
    const p = passwordProblem(req.body.password, req.user.email); if (p) throw bad(p);
    req.user.pw = await hashPassword(req.body.password);
    await store.put('users', req.user.id, req.user);
    res.json({ ok: true });
  });

  // ---------- the student's own data ----------
  api.get('/me/state/:app', auth(), async (req, res) => {
    if (!STATE_APPS.has(req.params.app)) throw bad('Unknown app.');
    const s = await store.get('state', `${req.user.id}:${req.params.app}`);
    res.json({ data: s?.data ?? null, rev: s?.rev ?? 0 });
  });
  api.put('/me/state/:app', auth(), async (req, res) => {
    if (!STATE_APPS.has(req.params.app)) throw bad('Unknown app.');
    const data = req.body?.data;
    if (!data || typeof data !== 'object') throw bad('No data.');
    if (JSON.stringify(data).length > MAX_STATE_BYTES) throw new HttpError(413, 'too_big', 'Saved progress is too large.');
    const id = `${req.user.id}:${req.params.app}`;
    const prev = await store.get('state', id);
    const rev = (prev?.rev || 0) + 1;
    await store.put('state', id, { userId: req.user.id, classId: req.user.classId, app: req.params.app, data, rev, updatedAt: new Date().toISOString() });
    res.json({ rev });
  });
  // Two writes per batch, whatever its size: the raw batch (kept for export and research) and the
  // student's running summary, which is all the staff pages need. Keeps us inside free database quotas.
  api.post('/me/events', auth(), async (req, res) => {
    const ts = new Date().toISOString();
    const list = (Array.isArray(req.body?.events) ? req.body.events.slice(0, 50) : []).map((e) => ({
      verb: str(e.verb, 30), object: str(e.object, 80), week: Number.isInteger(e.week) ? e.week : null, score: typeof e.score === 'number' ? e.score : null, ts,
    })).filter((e) => e.verb && e.object);
    if (!list.length) return res.json({ ok: true, n: 0 });
    await store.put('evlog', newId('evl'), { userId: req.user.id, classId: req.user.classId, ts, events: list });
    const sum = (await store.get('stats', req.user.id)) || { userId: req.user.id, classId: req.user.classId, weeks: {}, tutorQ: 0, quiz: {}, lastTs: null };
    for (const e of list) {
      if ((e.verb === 'completed' || e.verb === 'submitted') && e.week) {
        const w = (sum.weeks[e.week] = sum.weeks[e.week] || []);
        if (!w.includes(e.object) && w.length < 12) w.push(e.object);
      }
      if (e.verb === 'asked') sum.tutorQ += 1;
      if (e.verb === 'completed' && /-practice$/.test(e.object) && e.score != null) sum.quiz[e.object] = e.score;
    }
    sum.lastTs = ts; sum.classId = req.user.classId;
    await store.put('stats', req.user.id, sum);
    res.json({ ok: true, n: list.length });
  });
  api.post('/me/prompts', auth('student'), async (req, res) => {
    const list = Array.isArray(req.body?.prompts) ? req.body.prompts.slice(0, 20) : [];
    for (const p of list) {
      const text = str(p.text, 4000); if (!text) continue;
      await store.put('prompts', newId('prm'), {
        userId: req.user.id, classId: req.user.classId, name: req.user.name, tool: str(p.tool, 30), text,
        week: Number.isInteger(p.week) ? p.week : null, score: typeof p.score === 'number' ? p.score : null,
        dims: p.dims && typeof p.dims === 'object' ? p.dims : null, ie: !!p.ie, intent: str(p.intent, 12), words: Number(p.words) || 0, key: str(p.key, 40), ts: new Date().toISOString(),
      });
    }
    res.json({ ok: true });
  });
  api.post('/me/submissions', auth('student'), async (req, res) => {
    const key = str(req.body.key, 40);
    if (!/^w\d{1,2}-(build|reflect|lab)$/.test(key)) throw bad('Unknown activity.');
    const text = str(req.body.text, 20000); if (text.length < 15) throw bad('Write a little more first.');
    const id = `${req.user.id}:${key}`;
    const prev = await store.get('subs', id);
    if (prev && prev.status === 'released') throw new HttpError(409, 'released', 'This was already graded. Ask for a human review instead.');
    const sub = {
      ...(prev || {}), userId: req.user.id, classId: req.user.classId, name: req.user.name, section: req.user.section || null, key, week: Number(key.slice(1).split('-')[0]),
      text, aiuse: str(req.body.aiuse, 20) || 'None', submittedAt: new Date().toISOString(), status: 'submitted', ai: null, ta: null, comment: prev?.comment || '',
    };
    await store.put('subs', id, sub);
    dropSnap(req.user.classId);
    res.status(201).json({ ok: true });
  });
  api.post('/me/submissions/:key/appeal', auth('student'), async (req, res) => {
    const sub = await store.get('subs', `${req.user.id}:${str(req.params.key, 40)}`);
    if (!sub || sub.status !== 'released') throw bad('You can ask for a review once a grade is released.');
    sub.appeal = { at: new Date().toISOString(), note: str(req.body.note, 1000), done: false };
    await store.put('subs', sub.id, sub);
    dropSnap(sub.classId);
    res.json({ ok: true });
  });
  api.get('/me/export', auth(), async (req, res) => {
    const [state, events, prompts, subs] = await Promise.all([
      store.find('state', { userId: req.user.id }), store.find('evlog', { userId: req.user.id }),
      store.find('prompts', { userId: req.user.id }), store.find('subs', { userId: req.user.id }),
    ]);
    res.set('Content-Disposition', 'attachment; filename="my-cai3801-data.json"');
    res.json({ account: publicUser(req.user), state, events, prompts, submissions: subs.map(({ ai, ...s }) => s) });
  });

  // ---------- problem reports during testing ----------
  const reportLimit = rateLimiter({ max: 20, windowMs: 60 * 60_000 });
  api.post('/report', auth(), async (req, res) => {
    if (!reportLimit.hit(req.user.id)) throw new HttpError(429, 'slow_down', 'Thanks, we have your reports. Try again later.');
    const text = str(req.body.text, 2000); if (text.length < 5) throw bad('Tell us a little more.');
    await store.put('reports', newId('rep'), { classId: req.user.classId, userId: req.user.id, name: req.user.name, role: req.user.role, view: str(req.body.view, 40), ua: str(req.get('user-agent'), 160), text, at: new Date().toISOString(), done: false });
    dropSnap(req.user.classId);
    res.status(201).json({ ok: true });
  });
  api.post('/reports/:id/done', auth('faculty', 'ta'), async (req, res) => {
    const r = await store.get('reports', req.params.id);
    if (!r || r.classId !== req.user.classId) throw new HttpError(404, 'not_found', 'No such report.');
    r.done = true; r.doneBy = req.user.name;
    await store.put('reports', r.id, r);
    dropSnap(r.classId);
    res.json({ ok: true });
  });

  // ---------- AI (the key stays on the server) ----------
  const usage = new Map();
  api.post('/ai', auth(), async (req, res) => {
    if (!llm) throw new HttpError(503, 'no_ai', 'AI is not set up on this server.');
    const c = await classOf(req.user);
    const limit = req.user.role === 'student' ? (c?.aiDailyLimit ?? 150) : 2000;
    const key = `${req.user.id}:${today()}`;
    const n = (usage.get(key) || 0) + 1;
    if (n > limit) throw new HttpError(429, 'ai_limit', `You have used today's ${limit} AI requests. It resets tomorrow.`);
    usage.set(key, n);
    const raw = Array.isArray(req.body?.messages) ? req.body.messages : [];
    const messages = raw.slice(-24).map((m) => ({ role: m.role === 'assistant' ? 'assistant' : 'user', content: String(m.content ?? '').slice(0, 30000) })).filter((m) => m.content);
    if (!messages.length) throw bad('No message.');
    const total = messages.reduce((a, m) => a + m.content.length, 0);
    if (total > 120000) throw new HttpError(413, 'too_big', 'That request is too long.');
    try {
      const out = await llm.complete({ messages, json: !!req.body.json });
      res.json(req.body.json ? { json: out.json ?? null, text: out.text } : { text: out.text });
    } catch (err) {
      logger.error('ai error', err?.message || err);
      throw new HttpError(502, 'ai_error', 'The AI did not answer. Try again in a moment.');
    }
  });

  // ---------- staff ----------
  // Staff pages share one snapshot per class for up to 60 seconds, so ten TAs refreshing don't
  // multiply database reads. Any grading action clears it.
  const snapCache = new Map();
  const dropSnap = (cid) => snapCache.delete(cid);
  api.get('/class/snapshot', staff, async (req, res) => res.json(await snapshot(req.user)));
  async function snapshot(user) {
    const cid = user.classId;
    const hit = snapCache.get(cid);
    if (hit && Date.now() - hit.at < 60_000) return hit.data;
    const [users, stats, prompts, subs, cls, resets, reports] = await Promise.all([
      store.find('users', { classId: cid }), store.find('stats', { classId: cid }), store.find('prompts', { classId: cid }, { newest: 2000 }),
      store.find('subs', { classId: cid }), store.get('classes', cid), store.find('resetreq', { classId: cid }), store.find('reports', { classId: cid }, { newest: 200 }),
    ]);
    const now = weekOf(cls.termStart);
    const byUser = new Map(stats.map((x) => [x.userId, x]));
    const students = users.filter((u) => u.role === 'student').map((u) => {
      const st = byUser.get(u.id) || { weeks: {}, tutorQ: 0, quiz: {}, lastTs: null };
      const weeks = Array.from({ length: now }, (_, i) => Math.min(4, (st.weeks[i + 1] || []).length));
      const last = [st.lastTs, u.lastSeen, u.createdAt].filter(Boolean).sort().pop();
      return {
        id: u.id, name: u.name, email: u.email, section: u.section || null, disabled: !!u.disabled, createdAt: u.createdAt, lastSeen: u.lastSeen || null,
        weeks, lastActive: Math.floor((Date.now() - Date.parse(last)) / DAY), tutorQ: st.tutorQ || 0, quiz: st.quiz || {},
      };
    });
    const staffList = users.filter((u) => u.role !== 'student').map((u) => ({ id: u.id, name: u.name, email: u.email, role: u.role, sections: u.sections || [], disabled: !!u.disabled }));
    const sectionOf = new Map(users.map((u) => [u.id, u.section || null]));
    const data = {
      class: publicClass(cls, true), students, staff: staffList,
      // Prompt text is trimmed and graded work leaves out its text (fetched on demand), so the staff
      // page stays small at the end of term: 600 students x 14 weeks of work would otherwise be 20+ MB.
      prompts: prompts.map((p) => (p.text && p.text.length > 1500 ? { ...p, text: p.text.slice(0, 1500) + '…' } : p)),
      subs: subs.map((s) => {
        const slim = s.status === 'released' && !(s.appeal && !s.appeal.done);
        return { ...s, text: slim ? null : s.text, textLen: (s.text || '').length, section: s.section || sectionOf.get(s.userId) || null, rubric: rubricFor(s.key) };
      }),
      resets: resets.map(({ userId, name, email, section, role, at }) => ({ userId, name, email, section, role, at })),
      reports: user.role === 'faculty' ? reports.filter((r) => !r.done).reverse() : reports.filter((r) => !r.done && r.userId === user.id),
    };
    snapCache.set(cid, { at: Date.now(), data });
    return data;
  }
  api.get('/students/:uid/state/:app', staff, async (req, res) => {
    if (!STATE_APPS.has(req.params.app)) throw bad('Unknown app.');
    await sameClass(req, req.params.uid);
    const s = await store.get('state', `${req.params.uid}:${req.params.app}`);
    res.json({ data: s?.data ?? null, updatedAt: s?.updatedAt ?? null });
  });
  api.post('/students/:uid/reset-link', staff, async (req, res) => {
    const s = await sameClass(req, req.params.uid);
    if (s.role !== 'student' && req.user.role !== 'faculty') throw new HttpError(403, 'forbidden', 'Only faculty can reset staff passwords.');
    const link = await makeLink(req, 'reset', { userId: s.id }, 48);
    await store.del('resetreq', s.id);
    dropSnap(s.classId);
    res.json({ link, expiresInHours: 48 });
  });
  api.post('/students/:uid/active', auth('faculty'), async (req, res) => {
    const s = await sameClass(req, req.params.uid);
    if (s.id === req.user.id) throw bad("You can't turn off your own account.");
    s.disabled = !req.body.active;
    await store.put('users', s.id, s);
    if (s.disabled) for (const x of await store.find('sessions', { userId: s.id })) await store.del('sessions', x.id);
    dropSnap(s.classId);
    res.json({ ok: true });
  });
  api.post('/students/:uid/section', staff, async (req, res) => {
    const s = await sameClass(req, req.params.uid);
    const c = await classOf(req.user);
    const secs = c.sections && c.sections.length ? c.sections : ['001'];
    if (s.role === 'student') {
      if (!secs.includes(String(req.body.section))) throw bad('Unknown section.');
      s.section = String(req.body.section);
    } else {
      if (req.user.role !== 'faculty') throw new HttpError(403, 'forbidden', 'Only faculty assign TAs.');
      s.sections = (Array.isArray(req.body.sections) ? req.body.sections : []).map(String).filter((x) => secs.includes(x));
    }
    await store.put('users', s.id, s);
    for (const sub of await store.find('subs', { userId: s.id })) if (s.role === 'student') { sub.section = s.section; await store.put('subs', sub.id, sub); }
    dropSnap(s.classId);
    res.json({ ok: true });
  });
  api.post('/students/:uid/delete', auth('faculty'), async (req, res) => {
    const s = await sameClass(req, req.params.uid);
    if (s.id === req.user.id) throw bad("You can't delete your own account here.");
    if (String(req.body.confirm || '') !== s.email) throw bad('Type the email address to confirm.');
    for (const coll of ['state', 'evlog', 'prompts', 'subs', 'sessions']) for (const d of await store.find(coll, { userId: s.id })) await store.del(coll, d.id);
    for (const id of [s.id]) { await store.del('stats', id); await store.del('resetreq', id); await store.del('users', id); }
    dropSnap(s.classId);
    res.json({ ok: true });
  });
  api.get('/class/export.json', auth('faculty'), async (req, res) => {
    const cid = req.user.classId;
    const out = { exportedAt: new Date().toISOString(), class: await store.get('classes', cid) };
    for (const coll of ['users', 'state', 'stats', 'evlog', 'prompts', 'subs', 'reports']) {
      out[coll] = (await store.find(coll, { classId: cid })).map(({ pw, ...d }) => d);
    }
    res.set('Content-Disposition', `attachment; filename="cai3801-backup-${today()}.json"`);
    res.json(out);
  });
  api.post('/class/ta-invite', auth('faculty'), async (req, res) => {
    res.json({ link: await makeLink(req, 'ta-invite', {}, 7 * 24), expiresInHours: 168 });
  });
  api.post('/class/settings', auth('faculty'), async (req, res) => {
    const c = await classOf(req.user);
    if (req.body.newCode) c.joinCode = newJoinCode();
    if (typeof req.body.joinOpen === 'boolean') c.joinOpen = req.body.joinOpen;
    if (Number.isInteger(req.body.aiDailyLimit)) c.aiDailyLimit = Math.max(0, Math.min(1000, req.body.aiDailyLimit));
    if (/^\d{4}-\d{2}-\d{2}$/.test(req.body.termStart || '')) c.termStart = req.body.termStart;
    if (req.body.name) c.name = str(req.body.name, 120);
    if (req.body.sections !== undefined) { const secs = cleanSections(req.body.sections); if (!secs) throw bad('Add at least one section.'); c.sections = secs; }
    await store.put('classes', c.id, c);
    dropSnap(c.id);
    res.json({ class: publicClass(c, true) });
  });

  // grading
  async function subInClass(req) {
    const s = await store.get('subs', req.params.id);
    if (!s || s.classId !== req.user.classId) throw new HttpError(404, 'not_found', 'No such submission.');
    return s;
  }
  api.get('/subs/:id', staff, async (req, res) => {
    const s = await subInClass(req);
    res.json({ sub: { ...s, rubric: rubricFor(s.key) } });
  });
  // Once work is sent to faculty or released, only faculty can change it. Flags never clear.
  const taMayGrade = (req, s) => {
    if (req.user.role === 'faculty') return;
    if (s.status === 'faculty') throw new HttpError(409, 'with_faculty', 'This work is waiting for the instructor. Only they can change it now.');
    if (s.status === 'released') throw new HttpError(409, 'released', 'This grade is already released. Ask the instructor to change it.');
  };
  api.post('/subs/:id/ai', staff, async (req, res) => {
    const s = await subInClass(req);
    taMayGrade(req, s);
    const rubric = rubricFor(s.key);
    let json;
    if (req.body && req.body.json && typeof req.body.json === 'object') {
      // The TA ran the first pass with their own key in their browser. Only the result arrives here,
      // and cleanFirstPass still checks every quote against the submission.
      json = req.body.json;
    } else {
      if (!llm) throw new HttpError(503, 'no_ai', 'This server has no AI. Add your own Gemini key on the AI key page.');
      try { json = (await llm.complete({ messages: [{ role: 'user', content: firstPassPrompt(rubric, s.text) }], json: true })).json; }
      catch (err) { logger.error('first pass', err?.message || err); throw new HttpError(502, 'ai_error', 'The AI did not answer. Try again.'); }
    }
    dropSnap(s.classId);
    const before = s.ai?.flags || [];
    s.ai = cleanFirstPass(rubric, json, s.text);
    s.ai.flags = [...new Set([...before, ...s.ai.flags])];
    s.ai.by = req.body?.json ? 'ta-key' : 'server';
    s.status = 'ai_suggested';
    await store.put('subs', s.id, s);
    res.json({ sub: { ...s, rubric } });
  });
  api.post('/subs/:id/review', staff, async (req, res) => {
    const s = await subInClass(req);
    taMayGrade(req, s);
    const rubric = rubricFor(s.key);
    const scores = {};
    for (const c of rubric) {
      const v = Number(req.body?.scores?.[c.id]);
      if (!Number.isInteger(v) || v < 1 || v > c.max) throw bad(`Score for ${c.name} must be 1 to ${c.max}.`);
      scores[c.id] = v;
    }
    const comment = str(req.body.comment, 5000);
    if (comment.length < 10) throw bad('Add feedback for the student.');
    s.ta = scores; s.comment = comment; s.reviewedBy = req.user.name; s.reviewedAt = new Date().toISOString(); s.acceptedAI = !!req.body.acceptedAI;
    const lowConf = (s.ai?.crit || []).some((c) => c.conf < 0.6);
    const gap = (s.ai?.crit || []).some((c) => Math.abs((scores[c.id] ?? c.ai) - c.ai) >= 2);
    const flagged = (s.ai?.flags?.length || 0) > 0 || !!graderInjection(s.text);
    const why = req.user.role === 'faculty' ? null : (flagged ? 'flagged' : lowConf ? 'low AI confidence' : gap ? 'TA and AI differ by 2+' : null);
    dropSnap(s.classId);
    s.status = why ? 'faculty' : 'released'; s.why = why;
    await store.put('subs', s.id, s);
    res.json({ sub: { ...s, rubric } });
  });
  api.post('/subs/:id/signoff', auth('faculty'), async (req, res) => {
    const s = await subInClass(req);
    dropSnap(s.classId);
    s.status = 'released'; s.signedOffBy = req.user.name;
    await store.put('subs', s.id, s);
    res.json({ ok: true });
  });
  api.post('/subs/:id/appeal-done', auth('faculty'), async (req, res) => {
    const s = await subInClass(req);
    dropSnap(s.classId);
    if (!s.appeal) throw bad('This work has no open review request.');
    s.appeal.done = true;
    if (req.body?.note) s.appeal.reply = str(req.body.note, 2000);
    await store.put('subs', s.id, s);
    res.json({ ok: true });
  });
  api.get('/me/grades', auth('student'), async (req, res) => {
    const subs = await store.find('subs', { userId: req.user.id });
    res.json({ subs: subs.map(gradeView) });
  });
  const gradeView = (s) => ({
    key: s.key, week: s.week, submittedAt: s.submittedAt, status: s.status === 'released' ? 'released' : 'pending',
    ...(s.status === 'released' ? { scores: s.ta, comment: s.comment, rubric: rubricFor(s.key), reviewedBy: s.reviewedBy } : {}), appeal: s.appeal || null,
  });

  api.get('/class/export.csv', staff, async (req, res) => {
    const snap = await snapshot(req.user);
    const keys = [...new Set(snap.subs.map((s) => s.key))].sort((a, b) => parseInt(a.slice(1)) - parseInt(b.slice(1)));
    const q = (v) => { const t = String(v ?? ''); return /[",\n]/.test(t) || /^[=+\-@]/.test(t) ? `"${t.replace(/^([=+\-@])/, "'$1").replace(/"/g, '""')}"` : t; };
    const head = ['Student', 'Email', 'Section', ...keys.map((k) => `${k} (out of 100)`), 'Last active (days ago)'];
    const rows = snap.students.map((st) => [st.name, st.email, st.section || '', ...keys.map((k) => {
      const s = snap.subs.find((x) => x.userId === st.id && x.key === k && x.status === 'released');
      if (!s) return '';
      const max = s.rubric.reduce((a, c) => a + c.max, 0), got = s.rubric.reduce((a, c) => a + (s.ta?.[c.id] || 0), 0);
      return Math.round((got / max) * 100);
    }), st.lastActive]);
    res.set('Content-Type', 'text/csv; charset=utf-8');
    res.set('Content-Disposition', `attachment; filename="cai3801-grades-${today()}.csv"`);
    res.send([head, ...rows].map((r) => r.map(q).join(',')).join('\r\n') + '\r\n');
  });

  app.use('/api/c', api);

  // ---------- pages ----------
  // Files are re-read only when they change on disk. HTML and JS go out gzipped (the Studio is
  // about 550 KB raw, about 150 KB gzipped), which matters on phones and campus Wi-Fi.
  const fileCache = new Map();
  function cached(f) {
    const full = path.join(siteDir, f);
    let st; try { st = fs.statSync(full); } catch { return null; }
    if (!st.isFile()) return null;
    const hit = fileCache.get(full);
    if (hit && hit.mtime === st.mtimeMs) return hit;
    const raw = fs.readFileSync(full);
    const entry = { mtime: st.mtimeMs, raw, text: null, gz: zlib.gzipSync(raw, { level: 6 }) };
    fileCache.set(full, entry);
    return entry;
  }
  const read = (f) => { const e = cached(f); if (!e) throw new Error('missing ' + f); return (e.text ??= e.raw.toString('utf8')); };
  const wantsGzip = (req) => /\bgzip\b/.test(req.get('accept-encoding') || '');
  function sendBody(req, res, type, body, gz) {
    res.type(type); res.vary('Accept-Encoding');
    if (wantsGzip(req)) { res.set('Content-Encoding', 'gzip'); return res.send(gz || zlib.gzipSync(body, { level: 6 })); }
    res.send(body);
  }
  const loginPage = (req, res) => { res.set('Cache-Control', 'no-store'); const e = cached('login.html'); sendBody(req, res, 'html', e.raw, e.gz); };
  for (const p of ['/login', '/setup', '/join', '/join/:code', '/reset/:t', '/invite/:t', '/forgot', '/privacy']) app.get(p, loginPage);
  async function studio(req, res) {
    const u = await whoIs(req);
    if (!u) return res.redirect(302, '/login');
    const c = await classOf(u);
    const isStaff = u.role !== 'student';
    const [st, comp, lab] = await Promise.all([store.get('state', `${u.id}:studio`), store.get('state', `${u.id}:companion`), store.get('state', `${u.id}:lab`)]);
    const boot = {
      user: publicUser(u), class: publicClass(c, isStaff), state: { studio: st?.data ?? null, companion: comp?.data ?? null, lab: lab?.data ?? null },
      snapshot: isStaff ? await snapshot(u) : null,
      grades: isStaff ? null : (await store.find('subs', { userId: u.id })).map(gradeView),
      ai: !!llm,
    };
    const LSEP = String.fromCharCode(0x2028), PSEP = String.fromCharCode(0x2029);
    const json = JSON.stringify(boot).split('<').join('\\u003c').split(LSEP).join('\\u2028').split(PSEP).join('\\u2029');
    const html = read('studio.html').replace('<head>', `<head><script>window.CAI_BOOT=${json};</script>`);
    res.set('Cache-Control', 'no-store');
    sendBody(req, res, 'html', Buffer.from(html));
  }
  app.get('/', studio);
  app.get('/studio.html', studio);
  app.get(/\.(html|js|css|json)$/, (req, res, next) => {
    let rel; try { rel = decodeURIComponent(req.path).replace(/^\/+/, ''); } catch { return next(); }
    if (rel.includes('..') || /[\u0000-\u001f\\]/.test(rel)) return next();
    const e = cached(rel); if (!e) return next();
    res.set('Cache-Control', 'public, max-age=600');
    sendBody(req, res, path.extname(rel), e.raw, e.gz);
  });
  app.use(express.static(siteDir, { index: false, maxAge: '10m' }));

  app.use('/api', (req, res) => res.status(404).json({ error: 'not_found', message: 'No such API route.' }));
  app.use((req, res) => res.status(404).type('text').send('Not found'));
  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => {
    if (err instanceof HttpError) return res.status(err.status).json({ error: err.code, message: err.message });
    if (err.type === 'entity.parse.failed') return res.status(400).json({ error: 'bad_request', message: 'Body is not valid JSON.' });
    if (err.type === 'entity.too.large') return res.status(413).json({ error: 'too_big', message: 'That request is too large.' });
    logger.error(err);
    res.status(500).json({ error: 'internal', message: 'Something went wrong.' });
  });
  return app;
}
