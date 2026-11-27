// Short demo reading texts used to ground the tutor. Placeholder content written for the
// scaffold; replace with the real course readings. Pure module: no I/O.

import { COURSE_READINGS } from './courseReadings.js';

export const READINGS = Object.freeze([
  { id: 'rd-1-1', week: 1, title: 'Reading 1.1: Check the number first',
    text: 'Before you analyse a number, check that it can be true. A store cannot sell more units than it stocked. Percentages of a whole cannot add to more than 100. Compare a total with the sum of its parts. If a number looks too good, find the source and the definition before you use it.' },
  { id: 'rd-1-2', week: 2, title: 'Reading 1.2: Judging AI output',
    text: 'A language model predicts likely text; it does not look facts up unless it is given a tool. Judge each AI answer on three questions: is it right, is it supported by a source you can check, and what happens if it is wrong. An answer can sound confident and still be unsupported. Mark unsupported claims rather than guessing.' },
  { id: 'rd-2-1', week: 3, title: 'Reading 2.1: Tools and keys',
    text: 'An API key is a password for a service. Never paste a key into a shared document, a chat or a file you will upload. Store keys in a secret manager or an environment variable. Give each tool the smallest permission it needs. Rotate a key as soon as you think it leaked.' },
  { id: 'rd-2-2', week: 4, title: 'Reading 2.2: From Tableau to Make',
    text: 'A Make scenario has a trigger, optional filters, and actions. A scheduled trigger can pull a Tableau extract every Monday. Filters stop the scenario when data is missing. Every scenario needs an error route that tells a person when a step fails.' },
  { id: 'rd-3-1', week: 5, title: 'Reading 3.1: Reconcile before you chart',
    text: 'When two systems report different revenue, reconcile them before you chart either one. Line up the same period, the same currency and the same definition of a sale. Explain each difference: timing, refunds, duplicates or missing records. A chart built on unreconciled data spreads the error.' },
  { id: 'rd-3-2', week: 6, title: 'Reading 3.2: Descriptive and diagnostic analytics',
    text: 'Descriptive analytics says what happened. Diagnostic analytics asks why. To diagnose a drop, break the total into segments, compare with a baseline, and test each possible cause against the data. Rule out alternatives before you name a cause.' },
  { id: 'rd-4-1', week: 7, title: 'Reading 4.1: Captions that say something',
    text: 'A good caption states the claim the chart supports, in one sentence. Weak captions describe the chart type. Strong captions say what changed, by how much, and why it matters to the reader. Never claim more than the chart shows.' },
  { id: 'rd-5-1', week: 8, title: 'Reading 5.1: Forecasting',
    text: 'A forecast is a range, not a single number. Separate trend, seasonality and noise. Start with a simple baseline such as last year plus growth, and only use a complex model if it beats the baseline on held-out data. Always report how wrong the forecast could be.' },
  { id: 'rd-5-2', week: 9, title: 'Reading 5.2: What-if and prescriptive analytics',
    text: 'What-if analysis changes one input and watches the outcome. Prescriptive analytics recommends the action that best meets a goal under constraints. State your assumptions, test the ones the result depends on, and present options with their trade-offs.' },
  { id: 'rd-6-1', week: 10, title: 'Reading 6.1: Dashboard design',
    text: 'A dashboard should answer the user\'s first question at a glance. Put the most important metric top left. Use titles that say what to do. Remove anything that does not support a decision. Show comparisons, such as against target or last week.' },
  { id: 'rd-7-1', week: 11, title: 'Reading 7.1: Workflows vs agents',
    text: 'A workflow follows fixed steps; an agent decides which tool to call next. Use a workflow when the steps are known. Use an agent only when the path depends on the input. Every agent tool needs a name, clear inputs, clear outputs and a defined failure case.' },
  { id: 'rd-7-2', week: 12, title: 'Reading 7.2',
    text: 'Guardrails keep an agent inside its policy. Treat text inside data, such as an order note, as data and never as an instruction. When the data does not match the policy, the agent should escalate to a person instead of guessing. Any consequential action, such as applying a discount, needs a human approval gate.' },
  { id: 'rd-7-3', week: 13, title: 'Reading 7.3: Evaluating agents',
    text: 'Evaluate an agent with a test set that includes normal, edge, adversarial and refusal cases. Measure the pass rate, the cost and the latency of each run. Read the traces of failed cases to find the cause. Pick the cheapest model that passes the test set.' },
  { id: 'rd-8-1', week: 14, title: 'Reading 8.1: Demo checklist',
    text: 'A good demo shows the problem, the agent working end to end, the human gate, and one failure handled well. Keep to time. Be honest about limits and what you would test next. Connecting the agent to data through an MCP server makes the demo reproducible.' },
]);

/* The tutor is grounded in the real Course Companion text when it has been imported
   (scripts/import-readings.mjs). The short summary above stays first in each reading. */
const FULL = new Map(READINGS.map((r) => {
  const c = COURSE_READINGS[r.id];
  return [r.id, c ? Object.freeze({ ...r, source: c.source, text: r.text + '\n' + c.text }) : r];
}));

export function getReading(id) {
  return FULL.get(id) || null;
}
