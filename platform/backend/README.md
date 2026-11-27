# CAI 3801 Studio backend

Backend scaffold for the CAI 3801 learning platform. `../SPEC.md` is the contract. Plain
JavaScript (ES modules) on Node.js 22.9 or later, no build step.

## What is here

| Folder | What it does |
|---|---|
| `shared/` | Pure rules, no I/O. `competencies.js` (ids, names, level bands), `lessons.js` (14 lessons, rubrics, due dates), `readings.js` (short placeholder reading texts for the tutor), `competencyScore.js` (levels 0 to 100 from graded evidence only), `recommend.js` (rules R1 to R5 and the at-risk flag), `grading.js` (hybrid grading state machine, routing, kappa), `gamify.js` (XP, levels, badges, quests, week streaks). |
| `llm/` | One interface, `complete({ system, messages, json })`, with adapters `mock`, `vertex-gemini`, `openai-compatible`, `vertex-open` and an optional `vertex-claude`. `tutor.js` answers from reading text with citations and refuses lab answers. `gradeSuggest.js` returns validated per-criterion `{ score, evidence, confidence }`. |
| `api/` | Express app for Cloud Run, `service.js` (logic shared with MCP), storage (`memory` with 30 seeded demo students, or `firestore`), BigQuery event sink stub, demo role check. |
| `mcp/` | MCP server with the 7 SPEC tools, over stdio and Streamable HTTP. |
| `infra/` | Terraform skeleton for GCP, Dockerfiles, `cloudbuild.yaml`. |
| `test/` | `node:test` tests for shared rules, LLM layer, API and MCP. |

## Run locally

```
npm install
npm test            # all tests, memory storage and mock LLM, no credentials
npm run dev         # API on http://localhost:8080 (restarts on change)
npm run mcp         # MCP server on stdio
npm run mcp:http    # MCP server on http://0.0.0.0:8081/mcp (set HOST=127.0.0.1 locally)
```

`npm run dev`, `npm run mcp` and `npm run mcp:http` read `.env` if it exists. Copy
`.env.example` to start. Never commit `.env`.

Try the API (the role headers are demo only):

```
curl -H "x-demo-role: student" -H "x-demo-user: stu_005" http://localhost:8080/api/students/stu_005/recommendations
curl -H "x-demo-role: ta" -H "x-demo-user: ta_01" http://localhost:8080/api/class/overview
```

### Endpoints

| Method and path | Who | Does |
|---|---|---|
| `POST /api/events` | student (own events), TA, faculty | Record an xAPI-style event. A `submitted` event with `text` on a lab opens a submission. Students cannot post `graded`. |
| `GET /api/students/:id/progress` | student (self), TA, faculty | XP, level, quest, streak, badges, competency levels, released grades, recent events |
| `GET /api/students/:id/recommendations` | student (self), TA | Up to 3 next steps with reasons |
| `POST /api/tutor` | all | `{ question, readingIds? , readings?, activityId? }`. Defaults to the current week's reading. |
| `POST /api/submissions/:id/suggest` | TA, faculty | AI suggestion per criterion. Never releases. |
| `POST /api/submissions/:id/review` | TA, faculty | `{ criteria: [{ id, score }], comment }`. TA review, or faculty sign-off on routed items. |
| `GET /api/class/overview` | TA, faculty | Cohort averages, at-risk list, grading queue, faculty queue, calibration (QWK) |

Also `GET /healthz`, `GET /api/lessons` and `GET /api/rubrics/:id`.

### Demo data

The memory store builds the same 30 students every run, as of 2026-11-20 (week 12, term
starting 2026-08-31). Some students are shaped to show each rule: `stu_003` inactive (R3,
at-risk), `stu_005` tutor loop on Reading 7.2 (R4), `stu_007` weak everywhere (R2), `stu_009`
strong (R5), `stu_011` a 20+ point drop in design (at-risk), `stu_013` a week 12 lab with an
injection attempt (flag, routed to faculty). Week 12 Discount Desk submissions for `stu_002`,
`stu_009`, `stu_013` and `stu_017` wait for an AI suggestion.

## Environment variables

| Name | Default | Use |
|---|---|---|
| `STORAGE` | `memory` | `memory` or `firestore` |
| `LLM_PROVIDER` | `mock` | `mock`, `vertex-gemini`, `vertex-open`, `openai-compatible`, `vertex-claude` |
| `EVENT_SINK` | none | `bigquery` streams events to `BQ_DATASET`.`BQ_TABLE` (defaults `cai3801`.`events`) |
| `TERM_START` | `2026-08-31` | First Monday of term |
| `DEMO_NOW` | seed date with memory storage | Fixed clock. Leave unset with Firestore to use real time. |
| `DEMO_AUTH` | on | `off` makes the API return 501 until SSO is wired |
| `PORT` | 8080 (API), 8081 (MCP HTTP) | Cloud Run sets 8080 |
| `HOST` | `0.0.0.0` | MCP HTTP bind address. `127.0.0.1` turns on DNS rebinding protection. |
| `MCP_ROLE`, `MCP_USER` | `ta`, `ta_01` | Demo identity for the stdio MCP server |
| `GOOGLE_CLOUD_PROJECT`, `GOOGLE_CLOUD_LOCATION` | none, `us-central1` | Vertex AI, Firestore, BigQuery |
| `GEMINI_MODEL` | `gemini-2.5-flash` | Gemini model |
| `OPENAI_BASE_URL`, `OPENAI_MODEL`, `OPENAI_API_KEY` | none | OpenAI-compatible endpoint. Key comes from Secret Manager in production. |
| `OPENAI_JSON_MODE` | `on` | `off` if the server rejects `response_format` |
| `VERTEX_OPEN_URL`, `VERTEX_OPEN_MODEL` | none, `default` | Model Garden endpoint |
| `VERTEX_CLAUDE_MODEL`, `VERTEX_CLAUDE_LOCATION` | none, `us-east5` | Optional Claude on Vertex |
| `LLM_TEMPERATURE` | 0.2 | All real providers |

## Switching LLM providers

All providers use the same call, so nothing else changes. Real adapters load only when
selected, so tests never need cloud packages or credentials.

- **Gemini on Vertex AI** (default in production). Uses `@google/genai` in Vertex mode with
  Application Default Credentials. Locally run `gcloud auth application-default login`, then
  set `LLM_PROVIDER=vertex-gemini` and `GOOGLE_CLOUD_PROJECT`. No API key is used; if
  `GOOGLE_API_KEY` is set in your shell the SDK prints a note and still uses the project.
- **Open models on Vertex (Gemma, Llama)**. Deploy the model from Model Garden to an endpoint,
  then set `LLM_PROVIDER=vertex-open` and `VERTEX_OPEN_URL` to the endpoint's
  OpenAI-compatible `.../chat/completions` URL. Auth is a Google access token from ADC. Data
  stays in the project.
- **USF or self-hosted (vLLM, any OpenAI-compatible server)**. Set
  `LLM_PROVIDER=openai-compatible`, `OPENAI_BASE_URL` (for example `http://vllm:8000/v1`),
  `OPENAI_MODEL`, and `OPENAI_API_KEY` if the server needs one.
- **Claude on Vertex** (optional). `LLM_PROVIDER=vertex-claude` and `VERTEX_CLAUDE_MODEL`.
- **Mock**. `LLM_PROVIDER=mock` for tests and offline demos. Same input, same output.

## MCP server

Tools (SPEC): `list_lessons`, `get_student_progress`, `recommend_next_steps`, `get_rubric`,
`suggest_rubric_scores`, `record_review`, `class_overview`. Inputs are checked with zod and
each tool checks the caller's role against the SPEC table. `suggest_rubric_scores` takes a
`submissionId` (saved as a suggestion) or `rubricId` plus `text` (dry run, not saved).

### Claude Desktop

Edit `%APPDATA%\Claude\claude_desktop_config.json` (Windows) or
`~/Library/Application Support/Claude/claude_desktop_config.json` (macOS):

```json
{
  "mcpServers": {
    "cai3801": {
      "command": "node",
      "args": ["C:\\path\\to\\platform\\backend\\mcp\\stdio.js"],
      "env": { "MCP_ROLE": "ta", "MCP_USER": "ta_01", "LLM_PROVIDER": "mock" }
    }
  }
}
```

Restart Claude Desktop. The tools appear under the `cai3801` server.

### ADK agent (Python)

Outline for the Google Agent Development Kit. Class names follow current ADK docs; check
them against your ADK version.

```python
from google.adk.agents import LlmAgent
from google.adk.tools.mcp_tool.mcp_toolset import MCPToolset
from google.adk.tools.mcp_tool.mcp_session_manager import StreamableHTTPConnectionParams

tools = MCPToolset(connection_params=StreamableHTTPConnectionParams(
    url="https://YOUR-MCP-SERVICE.run.app/mcp",
    headers={"x-demo-role": "ta", "x-demo-user": "ta_01",
             "Authorization": "Bearer <identity token for the private Cloud Run service>"},
))
agent = LlmAgent(model="gemini-2.5-flash", name="ta_helper",
                 instruction="Help the TA. Suggestions are never final grades.", tools=[tools])
```

For stdio use `StdioConnectionParams` with `command="node"` and `args=["mcp/stdio.js"]`.

The HTTP transport is stateless: every POST to `/mcp` gets a fresh server that shares one
service and store.

## Auth (demo only)

`api/auth.js` reads `x-demo-role` (`student`, `ta`, `faculty`) and `x-demo-user`. Anyone who
can reach the service can claim any role, so keep the Cloud Run services private (no
`allUsers` invoker). TODO: replace it with USF SSO through Google Identity Platform, verify
the ID token and read the role from custom claims.

## Deploy outline (GCP)

Nothing here has been applied. Rough order:

1. `cd infra/terraform`, copy `terraform.tfvars.example` to `terraform.tfvars`, set the
   project. Add a GCS backend in `versions.tf`.
2. `terraform init`, then create the registry first:
   `terraform apply -target=google_project_service.apis -target=google_artifact_registry_repository.images`.
3. From `platform/backend`, build and push both images:
   `gcloud builds submit --config infra/cloudbuild.yaml --substitutions=_TAG=latest .`
   The deploy steps fail on the very first run because the services do not exist yet. That
   is expected.
4. `terraform apply` to create Firestore, BigQuery, Pub/Sub, secrets, service accounts and the
   two Cloud Run services.
5. Add secret values out of band, for example
   `gcloud secrets versions add cai3801-openai-api-key --data-file=-`, then set
   `openai_key_secret_ready = true` and apply again.
6. Later releases: `gcloud builds submit --config infra/cloudbuild.yaml --substitutions=_TAG=<sha> .`

Service accounts get only Vertex AI user, Firestore user (`roles/datastore.user`), BigQuery
data editor on the events dataset (API only), Pub/Sub publisher on the events topic (API
only) and access to their own secrets.

## Known gaps

- Real Vertex, Firestore and BigQuery calls are not tested. Tests cover the mock and fake
  HTTP for the OpenAI-compatible adapters only.
- The memory store forgets everything on restart, and the API and MCP services keep separate
  copies. Use Firestore to share data.
- The BigQuery sink is a stub (streaming insert, no retry). Production should publish to
  Pub/Sub with a BigQuery subscription.
- Readings are short placeholders. Replace them with the real course texts.
