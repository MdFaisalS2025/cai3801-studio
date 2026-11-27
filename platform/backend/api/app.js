// Express app for Cloud Run. Build it with createApp({ service }) so tests can inject a
// memory store and the mock LLM.

import express from 'express';
import { z } from 'zod';
import { demoAuth, requireRole, selfOr } from './auth.js';
import { ServiceError, VERBS } from './service.js';
import { GradingError } from '../shared/grading.js';
import { SuggestionError } from '../llm/gradeSuggest.js';

const EventBody = z.object({
  id: z.string().min(1).max(100).optional(),
  actor: z.string().min(1).max(100),
  verb: z.enum(VERBS),
  object: z.string().min(1).max(100),
  week: z.number().int().min(1).max(14).optional(),
  ts: z.iso.datetime({ offset: true }).optional(),
  result: z.object({ score: z.number().min(0).max(1).optional(), durationSec: z.number().min(0).optional() }).optional(),
  text: z.string().max(50000).optional(),
});

const TutorBody = z.object({
  question: z.string().min(1).max(2000),
  studentId: z.string().optional(),
  activityId: z.string().optional(),
  readingIds: z.array(z.string()).max(10).optional(),
  readings: z.array(z.object({ id: z.string(), title: z.string(), text: z.string().max(20000) })).max(10).optional(),
});

const ReviewBody = z.object({
  criteria: z.array(z.object({ id: z.string(), score: z.number().int() })).default([]),
  comment: z.string().max(5000).optional().default(''),
});

const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

function parse(schema, body) {
  const r = schema.safeParse(body ?? {});
  if (!r.success) throw new ServiceError(400, 'bad_request', r.error.issues.map((i) => `${i.path.join('.') || 'body'}: ${i.message}`).join('; '));
  return r.data;
}

export function createApp({ service, demoAuthEnabled = true, logger = console }) {
  const app = express();
  app.disable('x-powered-by');
  app.use(express.json({ limit: '1mb' }));

  app.get('/healthz', (req, res) => res.json({ ok: true }));

  const api = express.Router();
  api.use(demoAuth({ enabled: demoAuthEnabled }));

  api.get('/lessons', (req, res) => res.json({ lessons: service.listLessons() }));
  api.get('/rubrics/:id', wrap(async (req, res) => res.json(service.getRubric(req.params.id))));

  api.post('/events', wrap(async (req, res) => {
    const body = parse(EventBody, req.body);
    if (req.user.role === 'student' && body.actor !== req.user.user) {
      throw new ServiceError(403, 'forbidden', 'Students can only record their own events.');
    }
    if (body.verb === 'graded' && req.user.role === 'student') {
      throw new ServiceError(403, 'forbidden', 'Only the system or staff can record graded events.');
    }
    res.status(201).json(await service.recordEvent(body));
  }));

  api.get('/students/:id/progress', selfOr('id', 'ta', 'faculty'), wrap(async (req, res) => {
    res.json(await service.progress(req.params.id));
  }));

  // SPEC (MCP tools table): recommendations are for the student (self) and TAs.
  api.get('/students/:id/recommendations', selfOr('id', 'ta'), wrap(async (req, res) => {
    res.json(await service.recommendations(req.params.id));
  }));

  api.post('/tutor', wrap(async (req, res) => {
    const body = parse(TutorBody, req.body);
    const studentId = req.user.role === 'student' ? req.user.user : body.studentId;
    res.json(await service.askTutor({ ...body, studentId }));
  }));

  api.post('/submissions/:id/suggest', requireRole('ta', 'faculty'), wrap(async (req, res) => {
    res.json(await service.suggest(req.params.id));
  }));

  api.post('/submissions/:id/review', requireRole('ta', 'faculty'), wrap(async (req, res) => {
    const body = parse(ReviewBody, req.body);
    res.json(await service.review(req.params.id, { role: req.user.role, by: req.user.user, ...body }));
  }));

  api.get('/class/overview', requireRole('ta', 'faculty'), wrap(async (req, res) => {
    res.json(await service.classOverview());
  }));

  app.use('/api', api);

  app.use((req, res) => res.status(404).json({ error: 'not_found', message: `No route for ${req.method} ${req.path}.` }));

  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => {
    if (err instanceof ServiceError) return res.status(err.status).json({ error: err.code, message: err.message });
    if (err instanceof GradingError) return res.status(409).json({ error: err.code, message: err.message });
    if (err instanceof SuggestionError) return res.status(502).json({ error: err.code, message: err.message, issues: err.issues });
    if (err.type === 'entity.parse.failed') return res.status(400).json({ error: 'bad_request', message: 'Body is not valid JSON.' });
    logger.error(err);
    return res.status(500).json({ error: 'internal', message: 'Something went wrong.' });
  });

  return app;
}
