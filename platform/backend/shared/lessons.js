// The 14 weekly lessons of CAI 3801, their rubrics and the course calendar.
// Pure module: no I/O. Dates are computed from a term start passed in by the caller.

const XP = { read: 20, practice: 30, lab: 150, reflect: 20, project: 300 };
const MINUTES = { read: 15, practice: 10, lab: 90, reflect: 10, project: 120 };
// Day of the lesson week (0 = Monday) by which each activity type is due.
const DUE_DAY = { read: 2, practice: 4, lab: 6, reflect: 6, project: 6 };

function act(week, slug, type, title, extra = {}) {
  return {
    id: `w${week}-${slug}`,
    type,
    title,
    xp: XP[type],
    minutes: MINUTES[type],
    dueDay: DUE_DAY[type],
    ...extra,
  };
}

function lesson(week, title, competencies, agenticSkills, activities) {
  return { week, id: `w${week}`, title, competencies, agenticSkills, activities };
}

export const LESSONS = Object.freeze([
  lesson(1, 'Check the number first', ['critical', 'aiconcepts'], [], [
    act(1, 'read', 'read', 'Reading 1.1: Check the number first', { reading: 'rd-1-1' }),
    act(1, 'practice', 'practice', 'Check: spot the impossible total'),
    act(1, 'lab', 'lab', 'Sanity-check a sales report', { rubric: 'rubric-check' }),
    act(1, 'reflect', 'reflect', 'Which number did you almost trust?'),
  ]),
  lesson(2, 'Judging AI output', ['critical', 'responsible', 'aiconcepts'], [], [
    act(2, 'read', 'read', 'Reading 1.2: Judging AI output', { reading: 'rd-1-2' }),
    act(2, 'practice', 'practice', 'Check: right, wrong or unsupported?'),
    act(2, 'lab', 'lab', 'Grade three AI answers', { rubric: 'rubric-judge' }),
    act(2, 'reflect', 'reflect', 'When would you not use the AI answer?'),
  ]),
  lesson(3, 'Tools and keys', ['computational', 'responsible'], [], [
    act(3, 'read', 'read', 'Reading 2.1: Tools and keys', { reading: 'rd-2-1' }),
    act(3, 'practice', 'practice', 'Check: where should this key live?'),
    act(3, 'lab', 'lab', 'Connect a tool without leaking a key', { rubric: 'rubric-tools' }),
  ]),
  lesson(4, 'Tableau to Make', ['computational', 'design'], [], [
    act(4, 'read', 'read', 'Reading 2.2: From Tableau to Make', { reading: 'rd-2-2' }),
    act(4, 'practice', 'practice', 'Check: trigger, action or filter?'),
    act(4, 'lab', 'lab', 'Automate a weekly Tableau extract with Make', { rubric: 'rubric-build' }),
    act(4, 'reflect', 'reflect', 'What would break first in your scenario?'),
  ]),
  lesson(5, 'Reconcile before you chart', ['critical', 'computational'], [], [
    act(5, 'read', 'read', 'Reading 3.1: Reconcile before you chart', { reading: 'rd-3-1' }),
    act(5, 'practice', 'practice', 'Check: which source is right?'),
    act(5, 'lab', 'lab', 'Reconcile two revenue sources', { rubric: 'rubric-reconcile' }),
    act(5, 'reflect', 'reflect', 'What did the mismatch teach you?'),
  ]),
  lesson(6, 'Descriptive and diagnostic', ['aiconcepts', 'critical'], [], [
    act(6, 'read', 'read', 'Reading 3.2: Descriptive and diagnostic analytics', { reading: 'rd-3-2' }),
    act(6, 'practice', 'practice', 'Check: what happened vs why it happened'),
    act(6, 'lab', 'lab', 'Explain a drop in store sales', { rubric: 'rubric-diagnose' }),
  ]),
  lesson(7, 'Captions that say something', ['communication', 'design'], [], [
    act(7, 'read', 'read', 'Reading 4.1: Captions that say something', { reading: 'rd-4-1' }),
    act(7, 'practice', 'practice', 'Check: pick the caption with a claim'),
    act(7, 'lab', 'lab', 'Caption five charts for a manager', { rubric: 'rubric-caption' }),
    act(7, 'reflect', 'reflect', 'Rewrite your weakest caption'),
  ]),
  lesson(8, 'Forecasting', ['aiconcepts', 'computational'], [], [
    act(8, 'read', 'read', 'Reading 5.1: Forecasting', { reading: 'rd-5-1' }),
    act(8, 'practice', 'practice', 'Check: trend, season or noise?'),
    act(8, 'lab', 'lab', 'Forecast next quarter with a range', { rubric: 'rubric-forecast' }),
    act(8, 'reflect', 'reflect', 'How sure are you, and why?'),
  ]),
  lesson(9, 'What-if and prescriptive', ['aiconcepts', 'critical', 'creativity'], [], [
    act(9, 'read', 'read', 'Reading 5.2: What-if and prescriptive analytics', { reading: 'rd-5-2' }),
    act(9, 'practice', 'practice', 'Check: which lever moves the outcome?'),
    act(9, 'lab', 'lab', 'Price scenarios for a coffee chain', { rubric: 'rubric-whatif' }),
  ]),
  lesson(10, 'Dashboard design', ['design', 'communication', 'creativity'], [], [
    act(10, 'read', 'read', 'Reading 6.1: Dashboard design', { reading: 'rd-6-1' }),
    act(10, 'practice', 'practice', 'Check: what does this dashboard ask you to do?'),
    act(10, 'lab', 'lab', 'One-screen dashboard for a store manager', { rubric: 'rubric-dashboard' }),
    act(10, 'reflect', 'reflect', 'What did you leave off, and why?'),
  ]),
  lesson(11, 'Workflows vs agents', ['agentic', 'design', 'computational'], ['ag-tools', 'ag-instructions'], [
    act(11, 'read', 'read', 'Reading 7.1: Workflows vs agents', { reading: 'rd-7-1' }),
    act(11, 'practice', 'practice', 'Check: workflow or agent?'),
    act(11, 'lab', 'lab', 'Design a tool and write the agent policy', { rubric: 'rubric-agent-design' }),
    act(11, 'reflect', 'reflect', 'Where should this stay a workflow?'),
  ]),
  // Week 12 matches the SPEC example exactly.
  lesson(12, 'Guardrails and the human gate', ['agentic', 'critical', 'responsible'], ['ag-guardrails', 'ag-hitl'], [
    act(12, 'read', 'read', 'Reading 7.2', { reading: 'rd-7-2' }),
    act(12, 'practice', 'practice', 'Check: injected instructions'),
    act(12, 'lab', 'lab', 'Discount Desk lab', { rubric: 'rubric-desk' }),
    act(12, 'reflect', 'reflect', 'Where did your judgment change the outcome?'),
  ]),
  lesson(13, 'Evaluating agents', ['agentic', 'critical', 'computational'], ['ag-eval', 'ag-trace', 'ag-cost'], [
    act(13, 'read', 'read', 'Reading 7.3: Evaluating agents', { reading: 'rd-7-3' }),
    act(13, 'practice', 'practice', 'Check: normal, edge, adversarial or refusal?'),
    act(13, 'lab', 'lab', 'Build and run an agent test set', { rubric: 'rubric-eval' }),
    act(13, 'reflect', 'reflect', 'Which failure surprised you?'),
  ]),
  lesson(14, 'Final project demo', ['agentic', 'communication', 'creativity'], ['ag-mcp', 'ag-hitl'], [
    act(14, 'read', 'read', 'Reading 8.1: Demo checklist', { reading: 'rd-8-1' }),
    act(14, 'practice', 'practice', 'Check: dry run with a classmate'),
    act(14, 'project', 'project', 'Final project demo', { rubric: 'rubric-final', final: true }),
    act(14, 'reflect', 'reflect', 'What would you build next?'),
  ]),
]);

function rubric(id, title, criteria) {
  return {
    id,
    title,
    criteria: criteria.map(([name, competency, focus], i) => ({
      id: `c${i + 1}`,
      name,
      max: 5,
      competency,
      descriptors: {
        5: `${focus}: complete, accurate and backed by specific evidence.`,
        3: `${focus}: mostly there, with gaps or weak evidence.`,
        1: `${focus}: missing or not supported.`,
      },
    })),
  };
}

export const RUBRICS = Object.freeze([
  rubric('rubric-check', 'Sanity-check a sales report', [
    ['Evidence', 'critical', 'Names the suspicious numbers and shows the check used'],
    ['Concepts', 'aiconcepts', 'Explains why the number cannot be right'],
  ]),
  rubric('rubric-judge', 'Grade three AI answers', [
    ['Evidence', 'critical', 'Verifies each AI claim against a source'],
    ['Risk', 'responsible', 'Names who could be harmed by a wrong answer'],
    ['Concepts', 'aiconcepts', 'Explains why the model got it wrong'],
  ]),
  rubric('rubric-tools', 'Connect a tool without leaking a key', [
    ['Working setup', 'computational', 'The connection runs and is explained step by step'],
    ['Key handling', 'responsible', 'Keys are stored outside the file and never shared'],
  ]),
  rubric('rubric-build', 'Automate a weekly Tableau extract with Make', [
    ['Scenario logic', 'computational', 'Trigger, filters and actions are correct'],
    ['Design', 'design', 'The scenario fits the user need and handles failure'],
  ]),
  rubric('rubric-reconcile', 'Reconcile two revenue sources', [
    ['Evidence', 'critical', 'Finds and explains every mismatch'],
    ['Method', 'computational', 'The reconciliation steps are repeatable'],
  ]),
  rubric('rubric-diagnose', 'Explain a drop in store sales', [
    ['Concepts', 'aiconcepts', 'Separates what happened from why'],
    ['Evidence', 'critical', 'Each cause is backed by data, alternatives ruled out'],
  ]),
  rubric('rubric-caption', 'Caption five charts for a manager', [
    ['Claim', 'communication', 'Each caption states one clear claim'],
    ['Fit', 'design', 'Captions match what the chart can support'],
  ]),
  rubric('rubric-forecast', 'Forecast next quarter with a range', [
    ['Concepts', 'aiconcepts', 'Chooses and explains a suitable forecast method'],
    ['Method', 'computational', 'Shows the steps and a realistic range'],
  ]),
  rubric('rubric-whatif', 'Price scenarios for a coffee chain', [
    ['Concepts', 'aiconcepts', 'Models the levers and assumptions clearly'],
    ['Evidence', 'critical', 'Tests assumptions and states limits'],
    ['Options', 'creativity', 'Proposes options beyond the obvious one'],
  ]),
  rubric('rubric-dashboard', 'One-screen dashboard for a store manager', [
    ['Layout', 'design', 'The screen answers the manager\'s first question first'],
    ['Message', 'communication', 'Titles and labels say what to do'],
    ['Ideas', 'creativity', 'Uses a fresh but clear way to show the key metric'],
  ]),
  rubric('rubric-agent-design', 'Design a tool and write the agent policy', [
    ['Tool contract', 'agentic', 'Name, inputs, outputs and failure cases are defined'],
    ['Fit', 'design', 'Explains why an agent, not a workflow, is needed'],
    ['Policy', 'computational', 'Instructions are testable and unambiguous'],
  ]),
  rubric('rubric-desk', 'Discount Desk lab', [
    ['Evidence', 'critical', 'Every approval or refusal cites the order data'],
    ['Guardrails', 'agentic', 'Injected instructions are refused and mismatches escalated'],
    ['Human gate', 'responsible', 'No discount is applied without human approval'],
  ]),
  rubric('rubric-eval', 'Build and run an agent test set', [
    ['Test set', 'agentic', 'Covers normal, edge, adversarial and refusal cases'],
    ['Measurement', 'computational', 'Reports pass rate, cost and latency'],
    ['Diagnosis', 'critical', 'Uses traces to explain at least one failure'],
  ]),
  rubric('rubric-final', 'Final project demo', [
    ['Working agent', 'agentic', 'The agent works end to end with a human gate'],
    ['Demo', 'communication', 'The demo is clear, timed and honest about limits'],
    ['Originality', 'creativity', 'Solves a real problem in a new way'],
  ]),
]);

const ACTIVITY_INDEX = new Map();
for (const l of LESSONS) for (const a of l.activities) ACTIVITY_INDEX.set(a.id, { activity: a, lesson: l });

export function getLesson(idOrWeek) {
  return LESSONS.find((l) => l.id === idOrWeek || l.week === idOrWeek) || null;
}

export function getActivity(activityId) {
  const hit = ACTIVITY_INDEX.get(activityId);
  return hit ? hit.activity : null;
}

export function lessonForActivity(activityId) {
  const hit = ACTIVITY_INDEX.get(activityId);
  return hit ? hit.lesson : null;
}

export function getRubric(id) {
  return RUBRICS.find((r) => r.id === id) || null;
}

export function allActivities() {
  return LESSONS.flatMap((l) => l.activities.map((a) => ({ ...a, week: l.week, lessonId: l.id })));
}

/** Activities that produce a submission graded with a rubric. */
export function isSubmittable(activity) {
  return Boolean(activity && activity.rubric);
}

const DAY_MS = 24 * 60 * 60 * 1000;

/** Due time for an activity: Monday of its week plus dueDay, at 23:59 UTC. */
export function dueAt(activityId, termStart) {
  const hit = ACTIVITY_INDEX.get(activityId);
  if (!hit) return null;
  const start = Date.parse(termStart);
  const ms = start + ((hit.lesson.week - 1) * 7 + hit.activity.dueDay) * DAY_MS + (23 * 60 + 59) * 60 * 1000;
  return new Date(ms).toISOString();
}

/** Course week (1-14, clamped) for a date. */
export function weekForDate(date, termStart) {
  const days = Math.floor((Date.parse(date) - Date.parse(termStart)) / DAY_MS);
  return Math.max(1, Math.min(14, Math.floor(days / 7) + 1));
}

/** Every activity with its due date. */
export function calendar(termStart) {
  return allActivities().map((a) => ({ activityId: a.id, title: a.title, week: a.week, type: a.type, dueAt: dueAt(a.id, termStart) }));
}
