# Taking the CAI 3801 Studio live

Everything below is free. It takes about an hour the first time. The parts marked **you** need
your own sign-in; nothing here needs a password shared with anyone.

## What you get

- A web address students open on any device. Each student joins with the class code and their own
  email and password, picks their section, and connects their own free Gemini key.
- TAs get an invite link from the instructor, see their own sections' grading queue first, and
  make password-reset links when students ask.
- The instructor sets sections, invites TAs, signs off routed grades, sees problem reports,
  exports grades as a CSV for Canvas, and downloads a full backup.

## Just want to try it with the team first?

Run it from this laptop with a temporary public link: see `TESTING.md` (one command,
`.\start-local.ps1 -Share`). Use that for a test session, not for real students.

## Before you start

1. **USF check (instructor).** Ask USF IT or the registrar whether a course tool hosted outside
   USF may store student names, emails, work and grades. Share `platform/backend/classroom/README.md`
   and the privacy page (`/privacy`) with them.
2. **Build the site** on this computer: from the `cai` folder run `node build-site.js`.

## Step 1. Database: Turso (free, no card)

1. **You:** sign up at turso.tech and create a database (any name, region near Florida).
2. Copy two values from its page: the database URL (`libsql://...`) and an auth token.

## Step 2. Server: pick one

**A. Google Cloud Run (recommended).** Always on, HTTPS address, free tier. Google asks for a
card on file even though this stays free.

1. **You:** create a Google Cloud project and turn on billing. Set a budget alert at $1.
2. Install the Google Cloud CLI, then from the `cai` folder:
   ```
   gcloud run deploy cai3801 --source . --region us-east1 --max-instances 1 --memory 512Mi \
     --allow-unauthenticated \
     --set-env-vars CLASS_STORE=libsql,LLM_PROVIDER=none,COOKIE_SECURE=on \
     --set-env-vars TURSO_DATABASE_URL=<url>,TURSO_AUTH_TOKEN=<token>,SETUP_TOKEN=<long random text>
   ```
   (For real use, put the token and setup code in Secret Manager and use `--set-secrets`.)
3. When it prints the service URL, run the same command again adding `PUBLIC_URL=<that URL>`.

**B. Render (no card).** The free server sleeps after 15 quiet minutes; the next visitor waits
up to a minute. `render.yaml` is ready: **you** connect the repository on render.com (after the
GitHub push you're holding until the meeting), then paste the Turso values, a setup code and
`PUBLIC_URL` when it asks.

## Step 3. Check it

```
cd platform/backend
node scripts/smoke.mjs https://<your address>
```
All checks should pass.

## Step 4. Set up the course (instructor, about 10 minutes)

1. Open `https://<your address>/setup`, enter the setup code, your name, email and a password.
   Set the class name, term and the first day of week 1.
2. **Roster & access:** enter your sections (for example `001, 002, 003`) and press Save.
3. **Invite a TA** for each TA; send each link privately. Tick each TA's sections.
4. **Copy invite message** and post it in Canvas. Close joining after week 2.

## Step 5. Pilot before everyone (recommended)

Run one section for two weeks first, the way Harvard rolled out CS50's tutor. Ask students to use
**Report a problem** freely; reports appear at the top of Roster & access. Then open it to all.

## Every week

- TAs grade from **Grading queue** (their sections open first).
- Instructor signs off routed work in **Grading calibration**.
- Export grades (CSV) and import to the Canvas gradebook.
- Download **Full backup (JSON)** now and then. Turso also keeps a 1-day restore point.

## End of term

Export grades and a final backup, then delete student accounts from **Roster & access**
(the privacy page promises this).

## Tested on this computer

- 95 automated tests (accounts, roles, CSRF, sections, grading, routing, flagged work, CSV, resets, reports, gzip,
  deletion, rate limits, three database types).
- A full trial as instructor, TA and students on the libSQL database.
- The production Docker image under Cloud Run's limits (512 MB, 1 CPU): 600 students joining,
  saving, logging and submitting, 40 at a time, with 0 errors. Sign-up took about 3.7 s at the
  median (password hashing on one CPU), saves about 1 s, the TA class view under 0.1 s.
  Memory stayed near 53 MB.
- Not yet tested: a real Gemini key end to end, and a real Turso or Cloud Run deployment.
