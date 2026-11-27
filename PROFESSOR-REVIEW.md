# Before the pilot: what Dr. Uddin needs to review

Each item needs a decision or a sign-off. None of them blocks a demo, but all of them should be settled before students use the lab for credit.

## 1. Rubric and grading

- [ ] **Point split.** Each step keeps its points: Check the data 10, Forecast 20, Set the cap 30, Supervise the agent 20, Write the memo 15, File the case 5. Of the 100, 69 are scored by script and 31 by the instructor (Q4 8, Q7 10, memo 8, reflection 5). Approve or change it.
- [ ] **Typical-month tolerance.** The script accepts a typical month within 40% or $300 of the model's forecast, because Tableau's exponential smoothing can differ from ours. Too loose or too tight?
- [ ] **MASE check.** Any value between 0 and 3 earns the points; the script can't see the student's workbook. Keep it, or grade MASE by hand?
- [ ] **Agent score.** 20 points pro-rated by how many of the 11 decisions match the policy. Should missing a trap cost more than missing a routine request?
- [ ] **Late and practice files.** The script flags them; it doesn't deduct. Decide the penalty.
- [ ] **How grades get to Canvas.** Nothing posts automatically. Enter totals in SpeedGrader, or import the edited gradebook CSV.

## 2. Case design

- [ ] **Second product in New York and California.** For both states the worst sub-categories are Tables and Bookcases, and Bookcases already breaks even at the 80% cap. The lab reports that as the answer (80%, meaning "no cap needed"). Is that the lesson you want, or should those states use a different second product?
- [ ] **Variants.** Each student gets one of five request variants for their state (different order, amounts, reps and trap wording), fixed by name. The policy answers and the practice agent's mistakes are the same in every variant, and the tests check this. Approve or turn variants off (everyone gets variant 0).
- [ ] **Name-based state assignment** uses the same letter ranges as Lab 2 (A–F Ohio, G–L Pennsylvania, M–R New York, S–Z California). Confirm.

## 3. Claims in the Companion

The Companion's **Source Notes** page lists every factual claim and its status.

- [ ] **"Check the original"** (7 claims copied from the Week 1 deck): McKinsey and AI Index figures (88%, 79%, 39%), Moffatt v. Air Canada, Visa's $33 billion, the USPS figures, Klarna, Spotify and OpenAI deep research. They're quoted as the deck states them; the original sources weren't checked here.
- [ ] **"Instructor to confirm"** (3 claims): the NYC $218 billion example, the 20-point "accuracy and verification" rubric line, and the grade weights and milestone weeks.
- [ ] **HarborMart** is labelled as a teaching example, not a real company. Confirm it's fictional in the deck.
- [ ] **Provider terms** ("free-tier prompts may be used to improve products"). Recheck each term.
- [x] Dataset numbers (Superstore totals, the Texas example, Furniture and Technology figures, the "Sales N/A" amount) were recomputed from `superstore_sales_processed.csv`.

No citations or videos were invented. Every recording link points to an existing lecture recording in the Canvas course.

## 4. Links and access

- [ ] **Recording links are personal SharePoint/Stream links.** They open only for signed-in USF users. If the site is public, the links are visible but the videos stay protected. Confirm you're comfortable listing them, or swap in Canvas module links.
- [ ] **Canvas file links** point to course 2065356. Update them for a new term's course shell.
- [ ] **Class Tableau views.** `config.js` ships with two example views by other Tableau Public authors, clearly labelled as examples. Publish the class workbook and replace them.
- [ ] **Discount Guardrail Google Sheet.** Not set. Share a view-only copy and add the link to `config.js`.
- [ ] **Make scenario.** Currently the generic sign-in page. Add the class scenario link if there is one.

## 5. Hosting and privacy

- [ ] **Where to host.** GitHub Pages is free and public. The site contains only the practice dataset and course readings; no student data is ever sent to it. Confirm the readings can be public, or host on USF web space.
- [ ] **Canvas iframe.** Test that USF Canvas keeps the iframe when the assignment is saved. If it's stripped, post a link instead.
- [ ] **The tutor.** On the hosted site it only searches the readings. The Claude-powered tutor and agent run only in the claude.ai preview.

## 6. Pilot

- [ ] Choose a section and a week (Week 12 fits the Agentic AI module).
- [ ] Have a TA run one full case per state and grade it with the script.
- [ ] After the pilot, compare the class report's mistake counts with what you saw in the Q4/Q7 answers.
