// MCP server exposing the 7 SPEC tools. It reuses the same service (shared/ rules + store +
// LLM provider) as the HTTP API. Inputs are validated with zod.
//
// Identity is passed in when the server is created: from env for stdio, from headers per
// request for Streamable HTTP. DEMO ONLY; see api/auth.js for the SSO TODO.

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { getRubric } from '../shared/lessons.js';
import { suggestScores } from '../llm/gradeSuggest.js';

// SPEC: MCP server tools, "Who may call".
export const TOOL_ACCESS = Object.freeze({
  list_lessons: { roles: ['student', 'ta', 'faculty'] },
  get_student_progress: { roles: ['ta', 'faculty'], self: true },
  recommend_next_steps: { roles: ['ta'], self: true },
  get_rubric: { roles: ['student', 'ta', 'faculty'] },
  suggest_rubric_scores: { roles: ['ta', 'faculty'] },
  record_review: { roles: ['ta', 'faculty'] },
  class_overview: { roles: ['ta', 'faculty'] },
});

class AccessError extends Error {}

function check(tool, identity, studentId) {
  const rule = TOOL_ACCESS[tool];
  if (rule.roles.includes(identity.role)) return;
  if (rule.self && identity.role === 'student' && studentId && studentId === identity.user) return;
  throw new AccessError(`Role "${identity.role}" may not call ${tool}${rule.self ? ' for this student' : ''}.`);
}

const ok = (value) => ({ content: [{ type: 'text', text: JSON.stringify(value, null, 2) }] });
const fail = (err) => ({ isError: true, content: [{ type: 'text', text: `Error: ${err.message}` }] });

const studentId = z.string().regex(/^[a-z]+_[0-9a-z]+$/i, 'Use an id like stu_017.').describe('Student id, e.g. stu_017');

export function createMcpServer({ service, llm, identity, name = 'cai3801-studio', version = '0.1.0' }) {
  if (!identity || !identity.role) throw new Error('createMcpServer needs an identity { role, user }.');
  const server = new McpServer({ name, version });

  const tool = (toolName, config, handler) =>
    server.registerTool(toolName, config, async (args) => {
      try {
        return ok(await handler(args || {}));
      } catch (err) {
        return fail(err);
      }
    });

  tool('list_lessons', {
    title: 'List lessons',
    description: 'The 14 CAI 3801 lessons with their competencies, agentic skills and activities (with XP).',
    inputSchema: { week: z.number().int().min(1).max(14).optional().describe('Only this week') },
    annotations: { readOnlyHint: true },
  }, async ({ week }) => {
    check('list_lessons', identity);
    const lessons = service.listLessons();
    return { lessons: week ? lessons.filter((l) => l.week === week) : lessons };
  });

  tool('get_student_progress', {
    title: 'Get student progress',
    description: 'XP, level, badges, competency levels (from graded evidence only) and recent events for one student.',
    inputSchema: { studentId },
    annotations: { readOnlyHint: true },
  }, async (args) => {
    check('get_student_progress', identity, args.studentId);
    return service.progress(args.studentId);
  });

  tool('recommend_next_steps', {
    title: 'Recommend next steps',
    description: 'Up to 3 rule-based next steps (rules R1-R5), each with a plain-English reason.',
    inputSchema: { studentId },
    annotations: { readOnlyHint: true },
  }, async (args) => {
    check('recommend_next_steps', identity, args.studentId);
    return service.recommendations(args.studentId);
  });

  tool('get_rubric', {
    title: 'Get rubric',
    description: 'A rubric with its criteria, max points, competencies and descriptors.',
    inputSchema: { rubricId: z.string().min(1).describe('e.g. rubric-desk') },
    annotations: { readOnlyHint: true },
  }, async ({ rubricId }) => {
    check('get_rubric', identity);
    return service.getRubric(rubricId);
  });

  tool('suggest_rubric_scores', {
    title: 'Suggest rubric scores',
    description:
      'AI suggestion per criterion with an evidence quote and a confidence. Never a final grade. ' +
      'Pass submissionId to suggest for a stored submission (saved as ai_suggested), or rubricId + text for a dry run that is not saved.',
    inputSchema: {
      submissionId: z.string().optional(),
      rubricId: z.string().optional(),
      text: z.string().max(50000).optional(),
    },
  }, async ({ submissionId, rubricId, text }) => {
    check('suggest_rubric_scores', identity);
    if (submissionId) {
      const sub = await service.suggest(submissionId);
      return { submissionId: sub.id, status: sub.status, ai: sub.ai, routing: sub.routing, note: 'Suggestion only. A TA must confirm or change every score.' };
    }
    if (!rubricId || !text) throw new Error('Pass submissionId, or both rubricId and text.');
    const rubric = getRubric(rubricId);
    if (!rubric) throw new Error(`Rubric "${rubricId}" not found.`);
    const ai = await suggestScores({ provider: llm, rubric, text, now: service.now() });
    return { dryRun: true, ai, note: 'Suggestion only. Not saved.' };
  });

  tool('record_review', {
    title: 'Record review',
    description:
      'Save the human decision on a submission. A TA confirms or changes every AI score; routed items (low confidence, flags, TA-AI gap of 2+, finals) then wait for faculty sign-off.',
    inputSchema: {
      submissionId: z.string().min(1),
      criteria: z.array(z.object({ id: z.string(), score: z.number().int().min(0) })).default([]),
      comment: z.string().max(5000).optional(),
    },
  }, async ({ submissionId, criteria, comment }) => {
    check('record_review', identity);
    const sub = await service.review(submissionId, { role: identity.role, by: identity.user, criteria, comment: comment || '' });
    return { submissionId: sub.id, status: sub.status, routing: sub.routing, ta: sub.ta, faculty: sub.faculty };
  });

  tool('class_overview', {
    title: 'Class overview',
    description: 'Cohort competency averages, the at-risk list with reasons, grading queue and AI-human calibration.',
    inputSchema: {},
    annotations: { readOnlyHint: true },
  }, async () => {
    check('class_overview', identity);
    return service.classOverview();
  });

  return server;
}
