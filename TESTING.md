# Testing the CAI 3801 Studio with Dr. Uddin and the team

The goal: everyone uses the real classroom version, with their own account and role, the way a
student, TA and instructor will. Takes about 45 minutes together.

## 1. Get it running (pick one)

**A. Today, from this laptop (free, no accounts).** Good for one test session.

1. Install the tunnel tool once: `winget install --id Cloudflare.cloudflared`
2. From the `cai` folder: `powershell -ExecutionPolicy Bypass -File .\start-local.ps1 -Share`
3. Copy the `https://....trycloudflare.com` address it prints. That is the link for everyone.
   It works only while that window stays open and the laptop is awake. It changes every run.

**C. On a teammate's own computer.** Anyone can run their own private copy to test alone.

1. Install Node.js 24 (LTS) from nodejs.org. Nothing else is needed.
2. Get the code: `git clone https://github.com/MdFaisalS2025/cai3801-studio.git`, then
   `cd cai3801-studio` (or unzip the folder if they were sent a zip). Each person who runs their
   own copy does the professor setup on it; it is their own private course.
3. Open a terminal in that folder and run:
   - Windows: `powershell -ExecutionPolicy Bypass -File .\start-local.ps1`
   - Mac or Linux: `bash start-local.sh`
   The first run installs packages (about a minute) and prints a setup code.
4. Open http://localhost:8080/setup and follow the script below, playing every role.
   Use a private window for the TA and a different browser for the student.
5. To start over, stop it with Ctrl+C and delete `platform/backend/data/classroom.db`.

To let others in too, add `-Share` (Windows) or `--share` (Mac) after installing cloudflared
(`winget install --id Cloudflare.cloudflared` or `brew install cloudflared`).

**B. Hosted (free, always on).** For the pilot and the real term: follow `LAUNCH.md`
(Turso + Google Cloud Run). The link stays the same.

Use test accounts and made-up work only on option A. No real student data on a laptop link.

## 2. Roles

| Who | Role | How they get in |
|---|---|---|
| Dr. Uddin | Faculty | Opens `/setup` with the setup code from the server window |
| One teammate | TA | Invite link from Dr. Uddin (Roster & access, Invite a TA) |
| Everyone else | Students | Class code from Dr. Uddin, on `/join` |

Each person uses their own browser. To play two roles on one computer, open a private window for
the second one. Everyone makes their own free Gemini key (Account & AI key, about 2 minutes).

## 3. Script

**Dr. Uddin (faculty), first 10 minutes**
1. `/setup`: name, email, password, class name, first day of week 1.
2. Roster & access: sections `001, 002`, Save. Invite a TA and send the link. Tick the TA's section.
3. Copy invite message and share the class code with the students.

**Students, 20 minutes**
1. Join with the code. Pick a section. Connect your Gemini key.
2. This week: do the reading (answer the check inside it, write the reflection), the quick check,
   submit the build, write the reflection step.
3. Ask the AI tutor something from the reading. Try asking it for the lab answer: it should give
   hints, not the answer.
4. Practice: try Prompt Lab and Fact-check the AI.
5. Open Grades & feedback: your build shows "Waiting for review".
6. Use Report a problem for anything odd, even small things.

**TA, 15 minutes**
1. Accept the invite. Connect your Gemini key.
2. Grading queue opens on your sections. Pick a submission, Get AI first pass, change at least one
   score, tap feedback chips, Approve & next.
3. Roster & access: one student uses Forgot your password on the sign-in page; make the reset
   link and send it to them.

**Dr. Uddin, last 10 minutes**
1. Grading calibration: sign off on anything routed to you.
2. A student asks for a human review on a released grade; mark it reviewed.
3. Export grades (CSV). Open it in Excel. Download Full backup (JSON).
4. Read the problem reports. Mark them fixed as they are handled.

## 4. What to check

- Did anyone get stuck? Where?
- Did every submission reach the TA queue, and every released grade reach the student?
- Was anything confusing to read? Anything slow on a phone?
- Did the tutor ever give away an answer?

Write findings in Report a problem so they're all in one list.

## 5. After testing

Delete the test accounts from Roster & access (or delete `platform/backend/data/classroom.db`
while the server is stopped) before the real class.
