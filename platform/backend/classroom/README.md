# Classroom server

Runs the CAI 3801 Studio for a real class, without Canvas or USF sign-in. The instructor creates
the course, shares a class code, and each student makes their own account. Progress, prompts,
submissions and grades are saved on the server. AI runs on each person's own free Gemini key, kept
in their browser.

Quickest local run (Windows, from the `cai` folder): `.\start-local.ps1`. Add `-Share` for a
temporary public link for teammates. The team test plan is in `TESTING.md`.

## Roles

| Role | Gets in by | Can |
|---|---|---|
| Faculty | First-run setup (needs the setup code from the server log) | Everything in the class: roster, class code, TA invites, settings, grading, sign-off, review requests, CSV export, turning accounts off |
| TA | One-time invite link from faculty (7 days) | Roster, grading queue, AI first pass, reset links for students, all class insights, CSV export |
| Student | Class code + own email and password | Their own work only. Download their data. Ask for a human review of any released grade |

Forgotten passwords: a TA or faculty member makes a reset link (48 hours, works once) on
**Roster & access** and sends it to the student privately. No email service is needed.

## Run it locally

From `platform/backend`:

```
npm install
node build-site.js            # from the cai/ folder, builds ../../site
npm run classroom             # uses .env; Studio on http://localhost:8080
```

Open `/setup` the first time. The setup code is printed in the server log, or set `SETUP_TOKEN`.
Students go to `/join/CODE`. Everyone else uses `/login`.

## Free setup for about 600 students

Nothing here needs a paid plan. Check each provider's current free limits before term starts;
they change.

| Piece | Free option | Why it fits |
|---|---|---|
| AI | Each person's own **Gemini API key** from Google AI Studio (the **AI key** page in the Studio) | Calls go from the student's browser straight to Google. Each key has its own free daily quota, so 600 students get 600 quotas. The server never sees a key. |
| Web server | **Google Cloud Run** free tier (gives an HTTPS `*.run.app` address) | Handles the class easily; the server does little now that AI runs in browsers. Needs a Google Cloud billing account on file; set `--max-instances=1` and a $1 budget alert. |
| Database | **Turso** free plan (`CLASS_STORE=libsql`) | 5 GB, about 500 million row reads and 10 million row writes a month. The server writes two rows per batch of activity and caches the staff view for 60 seconds to stay well inside that. |
| No-card alternative | Render free web service + Turso | No credit card, but the server sleeps after 15 idle minutes, so the first visitor waits up to a minute. |

Deploy (from the `cai/` folder, after `node build-site.js`):

```
gcloud run deploy cai3801 --source . --region us-central1 --max-instances 1 \
  --set-env-vars CLASS_STORE=libsql,LLM_PROVIDER=none,COOKIE_SECURE=on,PUBLIC_URL=https://YOUR-URL \
  --set-secrets TURSO_DATABASE_URL=turso-url:latest,TURSO_AUTH_TOKEN=turso-token:latest,SETUP_TOKEN=setup-token:latest
```

(`--source .` builds with the `Dockerfile` in the `cai` folder. Step-by-step: `LAUNCH.md`.)

Things to tell students, also shown on the AI key page:
- Free-tier prompts may be used by Google to improve its products, so don't paste personal data.
- Google's own age and region rules apply to AI Studio. Anyone who can't or won't make a key still
  has everything except the AI features, and the practice tools fall back to built-in examples.
- If a key hits its daily limit, AI pauses until midnight Pacific time.

## Settings

| Name | Default | Use |
|---|---|---|
| `CLASS_STORE` | `sqlite` | `libsql` (Turso; use with Cloud Run), `sqlite` (one file, one server), `firestore` (small classes only), `memory` (tests) |
| `TURSO_DATABASE_URL`, `TURSO_AUTH_TOKEN` | | For `libsql`. Without a URL it uses a local file. |
| `CLASS_DB` | `./data/classroom.db` | SQLite or local libSQL file. Back it up. |
| `SITE_DIR` | `../../site` | Built site (`node build-site.js`) |
| `LLM_PROVIDER` | none | Leave unset for the free setup (everyone uses their own key). Set `vertex-gemini` only if the course pays for a shared model; `openai-compatible` for Ollama on a laptop. |
| `GEMINI_MODEL`, `GOOGLE_CLOUD_PROJECT` | | For `vertex-gemini` |
| `SETUP_TOKEN` | random, printed once | First-run code. Only works while there are no accounts. |
| `COOKIE_SECURE` | off locally, on in the Docker image | Must be on behind HTTPS |
| `PUBLIC_URL` | from the request | Base for invite and reset links, e.g. `https://studio.example.org` |
| `PORT`, `HOST` | `8080`, `0.0.0.0` | |

## Security choices

- Passwords: scrypt (N=2^15, r=8, p=3, which OWASP rates equal to N=2^17, r=8, p=1 with a quarter of the memory) with a per-user salt; at least 10 characters. At most 4 hashes run at once.
- AI keys stay in each person's browser (this tab only, unless they tick "remember on this device") and go only to Google. TA first passes made with a TA's key arrive as results, and the server still checks every quote.
- Sessions: 256-bit random tokens, stored only as SHA-256 hashes; cookie is HttpOnly, SameSite=Lax, Secure on HTTPS; 14 days.
- CSRF: every state-changing call needs the `x-cai-csrf` header and a same-host Origin.
- Login is rate limited (8 tries per 15 minutes per email and network); sign-ups per network too.
- Students can only read and write their own data; every staff route checks the class.
- AI requests are capped per student per day (faculty sets the number). Messages are size-limited.
- The AI first pass never releases a grade. Quotes not found in the submission lower its confidence.
- CSV export guards against spreadsheet formula injection.
- The Studio never stores account data in the browser, so shared lab computers don't leak work.

## Known limits

- Rate limits and AI counts are kept in memory: run one instance (Cloud Run `--max-instances=1`)
  or move them to the database before scaling out.
- Class averages on a student's skills page are not shown yet.
- Staff pages load graded work's text only when it is opened, to keep the class view small.

## Tests

`npm test` runs everything, including `test/classroom.test.js` (setup, join, roles, CSRF, state,
TA invite, AI first pass, review routing, sign-off, CSV, reset links, AI limits, rate limits).
