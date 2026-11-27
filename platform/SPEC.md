# CAI 3801 Studio: shared spec (v0.1)

A standalone learning platform for CAI 3801 (AI & Analytics for Organizations, USF). Not hosted in Canvas. Built on Google Cloud. This file is the contract between the front end (`studio.src.html` prototype) and the backend (`platform/backend`).

## Personas

| Persona | Main jobs |
|---|---|
| Student | Do the weekly lesson, earn XP and badges, see their competency growth, get personalised next steps, ask the AI tutor, submit work, see feedback |
| TA | Work the grading queue (AI suggests, TA decides), watch class activity, find students who need help, leave feedback |
| Faculty | Plan the 14 weeks and their competency targets, calibrate grading (AI vs human agreement), review cohort analytics, choose the LLM provider, manage MCP tools, sign off final grades |

## Competencies (every lesson targets 2–3)

| id | Name |
|---|---|
| `critical` | Critical thinking |
| `design` | Design thinking |
| `computational` | Computational thinking |
| `creativity` | Creativity |
| `communication` | Communication |
| `aiconcepts` | AI & analytics concepts |
| `agentic` | Agentic AI skills |
| `responsible` | Responsible AI |

Competency level per student: 0–100, computed from graded evidence only (never from time spent or points). Levels: 0–39 Emerging, 40–69 Developing, 70–89 Proficient, 90–100 Advanced.

## Agentic skills (taught weeks 11–14; `agentic` competency)

| id | Skill |
|---|---|
| `ag-tools` | Design a tool an agent can call (name, inputs, outputs, failure) |
| `ag-instructions` | Write agent instructions and a policy the agent must follow |
| `ag-guardrails` | Add guardrails: refuse injected instructions, escalate mismatches |
| `ag-hitl` | Put a human approval gate before any consequential action |
| `ag-eval` | Build a test set (normal, edge, adversarial, refusal) and measure |
| `ag-trace` | Keep an audit trail; read traces to debug |
| `ag-cost` | Measure cost and latency; pick the cheapest model that passes |
| `ag-mcp` | Connect an agent to data through an MCP server |

## Data model

```jsonc
// Lesson (one per week)
{ "week": 12, "id": "w12", "title": "Guardrails and the human gate",
  "competencies": ["agentic", "critical", "responsible"],
  "agenticSkills": ["ag-guardrails", "ag-hitl"],
  "activities": [
    { "id": "w12-read", "type": "read", "title": "Reading 7.2", "xp": 20 },
    { "id": "w12-practice", "type": "practice", "title": "Check: injected instructions", "xp": 30 },
    { "id": "w12-lab", "type": "lab", "title": "Discount Desk lab", "xp": 150, "rubric": "rubric-desk" },
    { "id": "w12-reflect", "type": "reflect", "title": "Where did your judgment change the outcome?", "xp": 20 }
  ] }

// Activity event (xAPI-style; stored in Firestore, streamed to BigQuery)
{ "id": "evt_…", "actor": "stu_017", "verb": "completed",          // viewed | started | completed | submitted | asked | graded
  "object": "w12-practice", "week": 12, "ts": "2026-11-20T15:02:11Z",
  "result": { "score": 0.8, "durationSec": 420 } }

// Submission + hybrid grade
{ "id": "sub_…", "student": "stu_017", "activity": "w12-lab", "submittedAt": "…",
  "ai": { "model": "gemini-2.5-flash", "criteria": [{ "id": "c1", "score": 4, "max": 5, "evidence": "quote from the work", "confidence": 0.82 }], "flags": ["possible-copy"] },
  "ta": { "by": "ta_02", "criteria": [{ "id": "c1", "score": 5 }], "comment": "…", "at": "…" },
  "faculty": { "signedOff": true, "by": "fac_01", "at": "…" },
  "status": "ai_suggested" }   // submitted → ai_suggested → ta_reviewed → released (faculty sign-off for disputes and finals)

// Rubric
{ "id": "rubric-desk", "criteria": [ { "id": "c1", "name": "Evidence", "max": 5, "competency": "critical", "descriptors": { "5": "…", "3": "…", "1": "…" } } ] }
```

## Hybrid grading rules

1. Objective items are scored by code from trusted data (e.g. the Discount Desk core). No model involved.
2. Open-ended items: the model suggests a score per criterion **with an evidence quote and a confidence**. It never releases a grade.
3. A TA confirms or changes every suggestion. Low confidence (< 0.6), flags, or a TA–AI gap of 2+ points routes to faculty.
4. Faculty calibrate weekly: double-grade a sample, track AI–human agreement (quadratic weighted kappa), and adjust the rubric or prompt.
5. Students see the human-confirmed grade and comment, plus a note that AI assisted the first pass.

## Recommendations (rule engine; transparent, no black box)

Inputs: last 14 days of events, competency levels, upcoming due dates. Output: up to 3 next steps, each with a reason the student can read.

| Rule | Trigger | Recommendation |
|---|---|---|
| R1 overdue | an activity due in ≤ 2 days not started | "Start X: due in N days" |
| R2 weak competency | a competency < 40 with evidence from ≥ 2 graded items | the next lesson activity that targets it, or a practice set |
| R3 inactivity | no events for 5+ days | a short 10-minute activity to restart |
| R4 tutor loop | 3+ tutor questions on one reading without completing its check | do the check; book office hours |
| R5 strength | a competency ≥ 85 | an optional challenge quest |

At-risk flag (TA view): R3 or two missed submissions or a 20-point drop in any competency. Flags inform a human; they never act on a student automatically.

## Gamification (evidence-informed, opt-out friendly)

- XP for completing activities; levels every 500 XP. XP never counts toward the grade.
- Badges for competency milestones and agentic skills (e.g. "Guardrail Builder").
- Weekly quests (3–4 activities) with a visible progress ring; streaks count weeks, not days.
- No public leaderboard by default. Optional team challenges; personal best and "you vs last week" instead of ranking.

## LLM providers (one interface, swappable)

| id | Provider | Use |
|---|---|---|
| `vertex-gemini` | Gemini on Vertex AI | default tutor and grading suggestions |
| `vertex-open` | Open models from Vertex Model Garden (Gemma, Llama) on a Vertex endpoint | open-source option, data stays in the project |
| `openai-compatible` | Any OpenAI-compatible endpoint (vLLM on GKE, or a USF-provided endpoint) | USF-hosted or self-hosted models |
| `vertex-claude` | Claude on Vertex AI | optional |
| `mock` | Deterministic local stub | tests and offline demo |

## MCP server tools (`platform/backend/mcp`)

| Tool | Who may call | Does |
|---|---|---|
| `list_lessons` | all | Lessons with competencies and activities |
| `get_student_progress` | student (self), TA, faculty | XP, competency levels, recent events |
| `recommend_next_steps` | student (self), TA | Rule-engine recommendations with reasons |
| `get_rubric` | all | A rubric |
| `suggest_rubric_scores` | TA, faculty | AI suggestion per criterion with evidence and confidence (never final) |
| `record_review` | TA, faculty | Save the human decision on a submission |
| `class_overview` | TA, faculty | Cohort competency averages, at-risk list |
