// Passwords, session tokens, one-time links and simple rate limits.
// Follows the OWASP Password Storage and Session Management cheat sheets: scrypt with a
// per-user salt, 256-bit random session tokens stored only as hashes, HttpOnly + SameSite
// cookies, Secure when served over HTTPS.

import crypto from 'node:crypto';
import { promisify } from 'node:util';

const scrypt = promisify(crypto.scrypt);
// OWASP lists N=2^15, r=8, p=3 as equal in strength to N=2^17, r=8, p=1, and it needs 32 MiB
// instead of 128 MiB per hash. That matters on a small free-tier server when a class signs in at once.
const SCRYPT = { N: 2 ** 15, r: 8, p: 3, maxmem: 64 * 1024 * 1024 };
let running = 0; const waiting = [];
async function gate(fn) {
  if (running >= 4) await new Promise((r) => waiting.push(r));
  running += 1;
  try { return await fn(); } finally { running -= 1; const next = waiting.shift(); if (next) next(); }
}
const KEYLEN = 32;

export async function hashPassword(pw, opts = SCRYPT) {
  const salt = crypto.randomBytes(16);
  const key = await gate(() => scrypt(pw.normalize('NFKC'), salt, KEYLEN, opts));
  return ['scrypt', opts.N, opts.r, opts.p, salt.toString('base64url'), key.toString('base64url')].join('$');
}

export async function verifyPassword(pw, stored) {
  if (typeof stored !== 'string') return false;
  const [alg, N, r, p, salt, key] = stored.split('$');
  if (alg !== 'scrypt') return false;
  const want = Buffer.from(key, 'base64url');
  const got = await gate(() => scrypt(String(pw).normalize('NFKC'), Buffer.from(salt, 'base64url'), want.length, { N: +N, r: +r, p: +p, maxmem: 256 * 1024 * 1024 }));
  return got.length === want.length && crypto.timingSafeEqual(got, want);
}

/** Checks a new password. Returns an error message or null. */
export function passwordProblem(pw, email = '') {
  if (typeof pw !== 'string' || pw.length < 10) return 'Use at least 10 characters.';
  if (pw.length > 200) return 'That password is too long.';
  if (email && pw.toLowerCase().includes(String(email).split('@')[0].toLowerCase()) && String(email).split('@')[0].length >= 4) return "Don't use your email name in the password.";
  if (/^(.)\1+$/.test(pw) || /^(0123456789|1234567890|password\d*|qwertyuiop)$/i.test(pw)) return 'That password is too easy to guess.';
  return null;
}

export const newToken = (bytes = 32) => crypto.randomBytes(bytes).toString('base64url');
export const sha256 = (s) => crypto.createHash('sha256').update(String(s)).digest('base64url');
export const newId = (prefix) => `${prefix}_${crypto.randomBytes(9).toString('base64url')}`;

const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; // no 0/O, 1/I/L
export function newJoinCode(len = 8) {
  const b = crypto.randomBytes(len);
  let s = '';
  for (let i = 0; i < len; i++) s += CODE_ALPHABET[b[i] % CODE_ALPHABET.length];
  return s.slice(0, 4) + '-' + s.slice(4);
}
export const normCode = (c) => String(c || '').toUpperCase().replace(/[^A-Z0-9]/g, '').replace(/^(.{4})(.+)$/, '$1-$2');

export const normEmail = (e) => String(e || '').trim().toLowerCase();
export const validEmail = (e) => /^[^\s@]{1,64}@[^\s@]{1,190}\.[^\s@]{2,}$/.test(e);

export function parseCookies(header) {
  const out = {};
  for (const part of String(header || '').split(';')) {
    const i = part.indexOf('=');
    if (i > 0) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}

export function sessionCookie(name, value, { secure, maxAgeSec }) {
  return [`${name}=${value}`, 'Path=/', 'HttpOnly', 'SameSite=Lax', secure ? 'Secure' : '', `Max-Age=${maxAgeSec}`].filter(Boolean).join('; ');
}

/** Fixed-window limiter kept in memory. Good for one instance; use a shared store if you scale out. */
export function rateLimiter({ max, windowMs }) {
  const hits = new Map();
  return {
    hit(key) {
      const now = Date.now();
      const h = hits.get(key);
      if (!h || now - h.start > windowMs) { hits.set(key, { start: now, n: 1 }); return true; }
      h.n += 1;
      if (hits.size > 5000) for (const [k, v] of hits) if (now - v.start > windowMs) hits.delete(k);
      return h.n <= max;
    },
    reset(key) { hits.delete(key); },
  };
}
