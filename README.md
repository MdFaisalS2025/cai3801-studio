# CAI 3801 Studio

A course website for CAI 3801 (AI & Analytics for Organizations, USF): weekly lessons and readings,
an AI tutor that gives hints, practice tools, the Discount Desk lab, and a grading queue where TAs
check AI-suggested scores before anything reaches a student.

## Try it on your computer

1. Install **Node.js 24** (LTS) from nodejs.org.
2. Get the code:
   ```
   git clone <this repository's address>
   cd <the folder it made>
   ```
3. Start it:
   - Windows: `powershell -ExecutionPolicy Bypass -File .\start-local.ps1`
   - Mac or Linux: `bash start-local.sh`
4. Open http://localhost:8080/setup and use the setup code printed in the terminal.

### Several people testing at once

- **Each person runs their own copy (most common).** Everyone clones and starts it on their own
  laptop, and each person does the professor setup on their own copy. Every copy is a separate
  private course at `localhost:8080`; nobody sees anyone else's.
- **Everyone shares one copy.** One person starts it with `-Share` (Windows) or `--share` (Mac)
  and sends the public link. Only the first person does setup and becomes the professor. Everyone
  else joins as a student with the class code, or as a TA with an invite link. Setup is closed
  after the first professor account exists.

The step-by-step test plan is in `TESTING.md`, and a printable version is
`CAI3801-Studio-Testing-Guide.docx`. Going live for a real class (free hosting) is in `LAUNCH.md`.

## Where things are

| Folder or file | What it is |
|---|---|
| `studio.src.html`, `studio-*.js` | The Studio: lessons, weeks, practice, grading queue, staff pages |
| `companion.html`, `tutor-engine.js` | Readings and the Desk Tutor |
| `desk.src.html`, `core/` | The Discount Desk lab |
| `login.html` | Sign-in, join with a class code, setup, password reset |
| `platform/backend/classroom/` | The server: accounts, roles, saving work, grading, exports |
| `build-site.js` | Builds everything into `site/` |

After editing any page, run `node build-site.js` (the start scripts do this for you).

Never commit student data, `.env` files or anything under `platform/backend/data/`.
