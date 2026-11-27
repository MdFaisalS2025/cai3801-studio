// Competencies, agentic skills and level bands (SPEC: Competencies, Agentic skills).
// Pure module: no I/O.

export const COMPETENCIES = Object.freeze([
  { id: 'critical', name: 'Critical thinking' },
  { id: 'design', name: 'Design thinking' },
  { id: 'computational', name: 'Computational thinking' },
  { id: 'creativity', name: 'Creativity' },
  { id: 'communication', name: 'Communication' },
  { id: 'aiconcepts', name: 'AI & analytics concepts' },
  { id: 'agentic', name: 'Agentic AI skills' },
  { id: 'responsible', name: 'Responsible AI' },
]);

export const COMPETENCY_IDS = Object.freeze(COMPETENCIES.map((c) => c.id));

export const AGENTIC_SKILLS = Object.freeze([
  { id: 'ag-tools', name: 'Design a tool an agent can call (name, inputs, outputs, failure)' },
  { id: 'ag-instructions', name: 'Write agent instructions and a policy the agent must follow' },
  { id: 'ag-guardrails', name: 'Add guardrails: refuse injected instructions, escalate mismatches' },
  { id: 'ag-hitl', name: 'Put a human approval gate before any consequential action' },
  { id: 'ag-eval', name: 'Build a test set (normal, edge, adversarial, refusal) and measure' },
  { id: 'ag-trace', name: 'Keep an audit trail; read traces to debug' },
  { id: 'ag-cost', name: 'Measure cost and latency; pick the cheapest model that passes' },
  { id: 'ag-mcp', name: 'Connect an agent to data through an MCP server' },
]);

export const AGENTIC_SKILL_IDS = Object.freeze(AGENTIC_SKILLS.map((s) => s.id));

// Inclusive bands on a 0-100 scale.
export const LEVEL_BANDS = Object.freeze([
  { id: 'emerging', name: 'Emerging', min: 0, max: 39 },
  { id: 'developing', name: 'Developing', min: 40, max: 69 },
  { id: 'proficient', name: 'Proficient', min: 70, max: 89 },
  { id: 'advanced', name: 'Advanced', min: 90, max: 100 },
]);

export function competencyName(id) {
  const c = COMPETENCIES.find((x) => x.id === id);
  return c ? c.name : id;
}

export function isCompetency(id) {
  return COMPETENCY_IDS.includes(id);
}

/** Band for a level 0-100. Returns null when level is null (no evidence yet). */
export function levelBand(level) {
  if (level === null || level === undefined || Number.isNaN(level)) return null;
  const v = Math.max(0, Math.min(100, Math.round(level)));
  return LEVEL_BANDS.find((b) => v >= b.min && v <= b.max);
}
