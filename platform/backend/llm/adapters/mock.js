// Deterministic local stub for tests and offline demos. Same input, same output, no network.
// It reads the optional `meta` hints that tutor.js and gradeSuggest.js pass along.

function hash(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i += 1) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

const STOP = new Set('the a an and or of to in on for is are be it this that with as by at from your you i we'.split(' '));

function words(s) {
  return (String(s).toLowerCase().match(/[a-z0-9]+/g) || []).filter((w) => !STOP.has(w));
}

function sentences(text) {
  return (text.match(/[^.!?\n]+[.!?]?/g) || []).map((s) => s.trim()).filter(Boolean);
}

function bestSentence(text, focus) {
  const f = new Set(words(focus));
  let best = null;
  let bestScore = -1;
  for (const s of sentences(text)) {
    const score = words(s).filter((w) => f.has(w)).length;
    if (score > bestScore) {
      best = s;
      bestScore = score;
    }
  }
  return best || text.slice(0, 120);
}

function grade(meta) {
  const text = meta.text || '';
  const wc = words(text).length;
  const forceLow = text.includes('[[mock-low-confidence]]');
  const criteria = meta.rubric.criteria.map((c) => {
    const h = hash(`${c.id}|${text}`);
    const base = Math.max(1, Math.min(c.max, Math.round(c.max * Math.min(1, wc / 80))));
    const score = Math.max(0, base - (h % 2));
    let confidence = wc < 20 ? 0.45 : 0.6 + (h % 35) / 100;
    if (forceLow) confidence = 0.4;
    const focus = `${c.name} ${c.descriptors ? c.descriptors['5'] : ''}`;
    return { id: c.id, score, evidence: bestSentence(text, focus), confidence: Number(confidence.toFixed(2)) };
  });
  return { criteria, flags: [] };
}

function tutorAnswer(meta) {
  const passages = meta.passages || [];
  const p = passages[0];
  if (!p) return 'I could not find this in the readings.';
  const extra = passages.slice(1, 2).map((q) => ` Also: ${q.text} [${q.id}]`).join('');
  return `From ${p.title}: ${p.text} [${p.id}]${extra}`;
}

export function create(env = {}) {
  const model = env.MOCK_MODEL || 'mock-1';
  return {
    id: 'mock',
    model,
    async complete({ system = '', messages = [], json = false, meta = {} } = {}) {
      let value;
      if (meta.task === 'grade') value = grade(meta);
      else if (meta.task === 'tutor') value = tutorAnswer(meta);
      else {
        const last = messages.length ? String(messages[messages.length - 1].content) : '';
        value = json ? { text: `mock reply ${hash(system + last) % 1000}` } : `mock reply to: ${last.slice(0, 80)}`;
      }
      const text = typeof value === 'string' ? value : JSON.stringify(value);
      return { text, json: json ? (typeof value === 'string' ? { text: value } : value) : null, model, provider: 'mock' };
    },
  };
}
